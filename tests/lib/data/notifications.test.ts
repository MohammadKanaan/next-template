// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import { NotFoundError, UnauthorizedError, ValidationError } from '@/lib/data/errors'
import {
  createNotification,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
} from '@/lib/data/notifications'
import { userChannel } from '@/lib/data/channels'
import type { RealtimeEvent } from '@/lib/dto/notifications'
import { isPushConfigured } from '@/lib/server/push'
import { enqueue } from '@/lib/server/queue'
import { publish, subscribe } from '@/lib/server/realtime'
import { getRedis, getRedisSubscriber } from '@/lib/server/redis'
import { createUser, resetDatabase, signInAs, signOut } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/server/push', () => ({ isPushConfigured: vi.fn(() => false) }))
vi.mock('@/lib/server/realtime', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/server/realtime')>('@/lib/server/realtime')
  return { ...actual, publish: vi.fn(actual.publish) }
})

const input = (userId: string, overrides: Partial<{ title: string; body: string }> = {}) => ({
  userId,
  type: 'comment' as const,
  title: overrides.title ?? 'Casey commented on "Post"',
  body: overrides.body ?? 'Nice',
  url: `/posts/${userId}/1`,
})

describe('notifications DAL', () => {
  beforeEach(resetDatabase)
  afterEach(() => {
    vi.restoreAllMocks()
    vi.mocked(enqueue).mockClear()
    vi.mocked(isPushConfigured).mockReturnValue(false)
  })
  afterAll(async () => {
    await getRedisSubscriber().quit()
    await getRedis().quit()
    await db.$disconnect()
  })

  describe('createNotification', () => {
    it('inserts, publishes the record on the recipient channel, and needs no session', async () => {
      const user = await createUser({})
      signOut()
      const received: RealtimeEvent[] = []
      const unsubscribe = await subscribe(userChannel(user.id), (event) => received.push(event))

      const notification = await createNotification(input(user.id))

      expect(notification).toMatchObject({
        type: 'comment',
        readAt: null,
        url: `/posts/${user.id}/1`,
      })
      expect(notification.createdAt).toBeInstanceOf(Date)
      await vi.waitFor(() => expect(received).toHaveLength(1))
      expect(received[0]).toEqual({ type: 'notification', notification })
      // Sign-up queued its verification email; only a push job would be wrong here.
      expect(enqueue).not.toHaveBeenCalledWith('send-push', expect.anything())
      unsubscribe()
    })

    it('queues a push only when push is configured', async () => {
      const user = await createUser({})
      vi.mocked(isPushConfigured).mockReturnValue(true)
      await createNotification(input(user.id))
      await vi.waitFor(() =>
        expect(enqueue).toHaveBeenCalledWith('send-push', {
          userId: user.id,
          title: 'Casey commented on "Post"',
          body: 'Nice',
          url: `/posts/${user.id}/1`,
        }),
      )
    })

    it('validates its input', async () => {
      const user = await createUser({})
      await expect(
        createNotification({ ...input(user.id), url: 'https://x' }),
      ).rejects.toBeInstanceOf(ValidationError)
      expect(await db.notification.count()).toBe(0)
    })
  })

  describe('reads', () => {
    it('lists the viewer’s own notifications newest first, paginated, and counts unread', async () => {
      const me = await createUser({})
      const other = await createUser({})
      await createNotification(input(me.id, { title: 'first' }))
      await createNotification(input(me.id, { title: 'second' }))
      await createNotification(input(other.id, { title: 'theirs' }))

      signOut()
      await expect(listNotifications({ page: 1, perPage: 10 })).rejects.toBeInstanceOf(
        UnauthorizedError,
      )
      await expect(getUnreadNotificationCount()).rejects.toBeInstanceOf(UnauthorizedError)

      await signInAs(me)
      const page = await listNotifications({ page: 1, perPage: 1 })
      expect(page).toMatchObject({ page: 1, perPage: 1, totalItems: 2, totalPages: 2 })
      expect(page.items.map((item) => item.title)).toEqual(['second'])
      expect((await listNotifications({ page: 2, perPage: 1 })).items[0].title).toBe('first')
      expect(await getUnreadNotificationCount()).toBe(2)
      await expect(listNotifications({ page: 0, perPage: 1 })).rejects.toBeInstanceOf(
        ValidationError,
      )
    })
  })

  describe('marking read', () => {
    it('marks one of the viewer’s notifications read and publishes the new unread count', async () => {
      const me = await createUser({})
      const other = await createUser({})
      const mine = await createNotification(input(me.id))
      await createNotification(input(me.id))
      const theirs = await createNotification(input(other.id))
      await signInAs(me)
      const received: RealtimeEvent[] = []
      const unsubscribe = await subscribe(userChannel(me.id), (event) => received.push(event))

      vi.mocked(publish).mockClear()
      const updated = await markNotificationRead(mine.id)
      expect(updated.readAt).toBeInstanceOf(Date)
      expect(await getUnreadNotificationCount()).toBe(1)
      await vi.waitFor(() => expect(received).toContainEqual({ type: 'unread', count: 1 }))

      // Already read: idempotent, no second publish.
      const again = await markNotificationRead(mine.id)
      expect(again.readAt).toEqual(updated.readAt)
      const unreadPublishes = vi
        .mocked(publish)
        .mock.calls.filter(([, event]) => event.type === 'unread')
      expect(unreadPublishes).toEqual([[userChannel(me.id), { type: 'unread', count: 1 }]])

      // Someone else’s, a missing id and a malformed id are all "not found".
      await expect(markNotificationRead(theirs.id)).rejects.toBeInstanceOf(NotFoundError)
      await expect(markNotificationRead(999)).rejects.toBeInstanceOf(NotFoundError)
      await expect(markNotificationRead('abc')).rejects.toBeInstanceOf(NotFoundError)
      signOut()
      await expect(markNotificationRead(mine.id)).rejects.toBeInstanceOf(UnauthorizedError)
      unsubscribe()
    })

    it('marks all read and publishes zero', async () => {
      const me = await createUser({})
      await createNotification(input(me.id))
      await createNotification(input(me.id))
      await signInAs(me)
      const received: RealtimeEvent[] = []
      const unsubscribe = await subscribe(userChannel(me.id), (event) => received.push(event))

      expect(await markAllNotificationsRead()).toBe(2)
      expect(await getUnreadNotificationCount()).toBe(0)
      await vi.waitFor(() => expect(received).toContainEqual({ type: 'unread', count: 0 }))
      expect(await markAllNotificationsRead()).toBe(0)
      unsubscribe()
    })
  })

  describe('subscribeToNotifications', () => {
    it('requires a session, returns the unread count and delivers the viewer’s events only', async () => {
      const me = await createUser({})
      const other = await createUser({})
      await createNotification(input(me.id))
      signOut()
      await expect(subscribeToNotifications(() => {})).rejects.toBeInstanceOf(UnauthorizedError)

      await signInAs(me)
      const received: RealtimeEvent[] = []
      const { unreadCount, unsubscribe } = await subscribeToNotifications((event) =>
        received.push(event),
      )
      expect(unreadCount).toBe(1)
      await publish(userChannel(other.id), { type: 'unread', count: 7 })
      await publish(userChannel(me.id), { type: 'unread', count: 3 })
      await vi.waitFor(() => expect(received).toEqual([{ type: 'unread', count: 3 }]))
      unsubscribe()
    })
  })
})
