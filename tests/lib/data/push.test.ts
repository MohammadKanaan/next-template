// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import { RateLimitedError, UnauthorizedError, ValidationError } from '@/lib/data/errors'
import { deletePushSubscriptionByEndpoint, listPushSubscriptions } from '@/lib/data/maintenance'
import { deletePushSubscription, getPushConfig, savePushSubscription } from '@/lib/data/push'
import { getPushPublicKey } from '@/lib/server/push'
import { getRedis } from '@/lib/server/redis'
import { createUser, resetDatabase, signInAs, signOut } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/server/push', () => ({ getPushPublicKey: vi.fn(() => null) }))

const subscription = (endpoint = 'https://push.example/a') => ({
  endpoint,
  keys: { p256dh: 'p', auth: 'a' },
})

describe('push DAL', () => {
  beforeEach(resetDatabase)
  afterEach(() => {
    vi.mocked(getPushPublicKey).mockReturnValue(null)
    vi.unstubAllEnvs()
  })
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

  it('exposes the public key only when configured', () => {
    expect(getPushConfig()).toBeNull()
    vi.mocked(getPushPublicKey).mockReturnValue('pub')
    expect(getPushConfig()).toEqual({ publicKey: 'pub' })
  })

  it('saves the viewer’s subscription, re-owning an endpoint another user had', async () => {
    const first = await createUser({})
    const second = await createUser({})
    signOut()
    await expect(savePushSubscription(subscription())).rejects.toBeInstanceOf(UnauthorizedError)

    await signInAs(first)
    await expect(savePushSubscription({ ...subscription(), endpoint: 'x' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    await savePushSubscription(subscription())
    await savePushSubscription(subscription())
    expect(await db.pushSubscription.count()).toBe(1)

    await signInAs(second)
    await savePushSubscription({ ...subscription(), keys: { p256dh: 'p2', auth: 'a2' } })
    const rows = await db.pushSubscription.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ userId: second.id, p256dh: 'p2' })
  })

  it('rate limits saving a subscription per user in production', async () => {
    const [first, second] = [await createUser({}), await createUser({})]
    await signInAs(first)
    vi.stubEnv('NODE_ENV', 'production')
    for (let n = 0; n < 10; n++) {
      await savePushSubscription(subscription(`https://push.example/${n}`))
    }
    await expect(
      savePushSubscription(subscription('https://push.example/11')),
    ).rejects.toBeInstanceOf(RateLimitedError)
    expect(await db.pushSubscription.count({ where: { userId: first.id } })).toBe(10)

    await signInAs(second)
    await expect(
      savePushSubscription(subscription('https://push.example/other')),
    ).resolves.toBeUndefined()
  })

  it('deletes only the viewer’s own subscription and ignores a missing one', async () => {
    const owner = await createUser({})
    const other = await createUser({})
    await signInAs(owner)
    await savePushSubscription(subscription())
    await signInAs(other)
    await deletePushSubscription('https://push.example/a')
    expect(await db.pushSubscription.count()).toBe(1)
    await signInAs(owner)
    await deletePushSubscription('https://push.example/a')
    await deletePushSubscription('https://push.example/a')
    expect(await db.pushSubscription.count()).toBe(0)
    signOut()
    await expect(deletePushSubscription('https://push.example/a')).rejects.toBeInstanceOf(
      UnauthorizedError,
    )
  })

  it('maintenance lists a user’s targets and deletes by endpoint without a viewer', async () => {
    const user = await createUser({})
    await signInAs(user)
    await savePushSubscription(subscription('https://push.example/1'))
    await savePushSubscription(subscription('https://push.example/2'))
    signOut()
    const targets = await listPushSubscriptions(user.id)
    expect(targets.map((target) => target.endpoint).sort()).toEqual([
      'https://push.example/1',
      'https://push.example/2',
    ])
    expect(targets[0].keys).toEqual({ p256dh: 'p', auth: 'a' })
    await deletePushSubscriptionByEndpoint('https://push.example/1')
    expect(await listPushSubscriptions(user.id)).toHaveLength(1)
  })
})
