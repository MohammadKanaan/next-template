// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleSendPush } from '@/jobs/sendPush'
import { deletePushSubscriptionByEndpoint, listPushSubscriptions } from '@/lib/data/maintenance'
import { PushGoneError, sendPush } from '@/lib/server/push'

vi.mock('@/lib/data/maintenance', () => ({
  listPushSubscriptions: vi.fn(async () => []),
  deletePushSubscriptionByEndpoint: vi.fn(async () => {}),
}))
vi.mock('@/lib/server/push', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/push')>('@/lib/server/push')
  return { ...actual, sendPush: vi.fn(async () => {}) }
})

const payload = { userId: 'u1', title: 'T', body: 'B', url: '/posts/u1/1' }
const target = (n: number) => ({
  endpoint: `https://push.example/${n}`,
  keys: { p256dh: 'p', auth: 'a' },
})

describe('send-push job', () => {
  afterEach(() => {
    vi.mocked(sendPush).mockReset().mockResolvedValue()
    vi.mocked(listPushSubscriptions).mockReset().mockResolvedValue([])
    vi.mocked(deletePushSubscriptionByEndpoint).mockClear()
  })

  it('sends the payload to each of the user’s subscriptions', async () => {
    vi.mocked(listPushSubscriptions).mockResolvedValue([target(1), target(2)])
    await handleSendPush(payload)
    expect(listPushSubscriptions).toHaveBeenCalledWith('u1')
    expect(sendPush).toHaveBeenCalledTimes(2)
    expect(sendPush).toHaveBeenCalledWith(target(1), { title: 'T', body: 'B', url: '/posts/u1/1' })
  })

  it('does nothing when the user has no subscriptions', async () => {
    await handleSendPush(payload)
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('re-validates the payload', async () => {
    await expect(handleSendPush({ ...payload, userId: '' })).rejects.toThrow()
    await expect(handleSendPush(null)).rejects.toThrow()
  })

  it('drops a subscription the push service no longer knows and finishes the others', async () => {
    vi.mocked(listPushSubscriptions).mockResolvedValue([target(1), target(2)])
    vi.mocked(sendPush).mockImplementation(async (t) => {
      if (t.endpoint.endsWith('/1')) {
        throw new PushGoneError(t.endpoint)
      }
    })
    await handleSendPush(payload)
    expect(deletePushSubscriptionByEndpoint).toHaveBeenCalledWith('https://push.example/1')
    expect(deletePushSubscriptionByEndpoint).toHaveBeenCalledTimes(1)
  })

  it('lets any other failure propagate after the loop so pg-boss retries', async () => {
    vi.mocked(listPushSubscriptions).mockResolvedValue([target(1), target(2)])
    vi.mocked(sendPush).mockImplementation(async (t) => {
      if (t.endpoint.endsWith('/1')) {
        throw new Error('push service down')
      }
    })
    await expect(handleSendPush(payload)).rejects.toThrow('push service down')
    expect(sendPush).toHaveBeenCalledTimes(2)
    expect(deletePushSubscriptionByEndpoint).not.toHaveBeenCalled()
  })
})
