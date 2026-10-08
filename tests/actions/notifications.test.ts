// @vitest-environment node
import { refresh } from 'next/cache'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { markAllNotificationsReadAction, markNotificationReadAction } from '@/actions/notifications'
import { db } from '@/lib/data/db'
import { createNotification } from '@/lib/data/notifications'
import { getRedis } from '@/lib/server/redis'
import { createUser, resetDatabase, signInAs } from '../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(async () => import('../helpers/cookies'))
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/server/push', () => ({ isPushConfigured: () => false }))

describe('notification actions', () => {
  beforeEach(resetDatabase)
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

  it('marks one read and refreshes; failures come back as results', async () => {
    const user = await createUser({})
    const notification = await createNotification({
      userId: user.id,
      type: 'comment',
      title: 'T',
      body: '',
      url: '/x',
    })
    expect(await markNotificationReadAction(notification.id)).toMatchObject({
      ok: false,
      code: 'UNAUTHORIZED',
    })
    await signInAs(user)
    const result = await markNotificationReadAction(notification.id)
    expect(result.ok && result.data.readAt).toBeInstanceOf(Date)
    expect(refresh).toHaveBeenCalled()
    expect(await markNotificationReadAction(999)).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  })

  it('marks all read', async () => {
    const user = await createUser({})
    await createNotification({ userId: user.id, type: 'comment', title: 'T', body: '', url: '/x' })
    await signInAs(user)
    expect(await markAllNotificationsReadAction()).toEqual({ ok: true, data: 1 })
  })
})
