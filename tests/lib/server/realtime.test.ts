// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { publish, subscribe } from '@/lib/server/realtime'
import { getRedis, getRedisSubscriber } from '@/lib/server/redis'
import type { RealtimeEvent } from '@/lib/dto/notifications'
import { resetRedis } from '../../helpers/server'

const CHANNEL = 'realtime:test'

describe('realtime', () => {
  beforeEach(resetRedis)
  afterEach(() => vi.restoreAllMocks())
  afterAll(async () => {
    await getRedisSubscriber().quit()
    await getRedis().quit()
  })

  it('delivers a published event to every listener on the channel', async () => {
    const first: RealtimeEvent[] = []
    const second: RealtimeEvent[] = []
    const unsubscribeFirst = await subscribe(CHANNEL, (event) => first.push(event))
    const unsubscribeSecond = await subscribe(CHANNEL, (event) => second.push(event))

    await publish(CHANNEL, { type: 'unread', count: 2 })

    await vi.waitFor(() => expect(first).toEqual([{ type: 'unread', count: 2 }]))
    expect(second).toEqual([{ type: 'unread', count: 2 }])
    unsubscribeFirst()
    unsubscribeSecond()
  })

  it('revives dates in a notification event', async () => {
    const received: RealtimeEvent[] = []
    const unsubscribe = await subscribe(CHANNEL, (event) => received.push(event))
    const createdAt = new Date('2026-10-07T10:00:00.000Z')
    await publish(CHANNEL, {
      type: 'notification',
      notification: {
        id: 1,
        type: 'comment',
        title: 'T',
        body: '',
        url: '/x',
        readAt: null,
        createdAt,
      },
    })
    await vi.waitFor(() => expect(received).toHaveLength(1))
    const event = received[0]
    expect(event.type === 'notification' && event.notification.createdAt).toEqual(createdAt)
    unsubscribe()
  })

  it('stops delivering after unsubscribe and drops malformed messages', async () => {
    const received: RealtimeEvent[] = []
    const unsubscribe = await subscribe(CHANNEL, (event) => received.push(event))
    await getRedis().publish(CHANNEL, 'not json')
    await getRedis().publish(CHANNEL, JSON.stringify({ type: 'nope' }))
    await publish(CHANNEL, { type: 'unread', count: 1 })
    await vi.waitFor(() => expect(received).toHaveLength(1))

    unsubscribe()
    await publish(CHANNEL, { type: 'unread', count: 9 })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(received).toHaveLength(1)
  })

  it('never throws from publish when Redis fails', async () => {
    vi.spyOn(getRedis(), 'publish').mockRejectedValueOnce(new Error('down'))
    await expect(publish(CHANNEL, { type: 'unread', count: 1 })).resolves.toBeUndefined()
  })
})
