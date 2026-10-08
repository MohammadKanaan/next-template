// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscribePushAction, unsubscribePushAction } from '@/actions/push'
import { db } from '@/lib/data/db'
import { getRedis } from '@/lib/server/redis'
import { createUser, resetDatabase, signInAs } from '../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(async () => import('../helpers/cookies'))
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

const subscription = { endpoint: 'https://push.example/a', keys: { p256dh: 'p', auth: 'a' } }

describe('push actions', () => {
  beforeEach(resetDatabase)
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

  it('stores and removes the subscription', async () => {
    expect(await subscribePushAction(subscription)).toMatchObject({
      ok: false,
      code: 'UNAUTHORIZED',
    })
    const user = await createUser({})
    await signInAs(user)
    expect(await subscribePushAction(subscription)).toEqual({ ok: true, data: null })
    expect(await db.pushSubscription.count()).toBe(1)
    expect(await subscribePushAction({ ...subscription, endpoint: 'x' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    })
    expect(await unsubscribePushAction(subscription.endpoint)).toEqual({ ok: true, data: null })
    expect(await db.pushSubscription.count()).toBe(0)
  })
})
