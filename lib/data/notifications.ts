import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { idSchema, toPage, type Page } from '@/lib/dto/common'
import {
  createNotificationInput,
  listNotificationsQuery,
  type CreateNotificationInput,
  type ListNotificationsQuery,
  type Notification,
} from '@/lib/dto/notifications'
import { logger } from '@/lib/server/logger'
import { isPushConfigured } from '@/lib/server/push'
import { enqueue } from '@/lib/server/queue'
import { publish, subscribe, type RealtimeListener } from '@/lib/server/realtime'
import { requireUser } from './auth'
import { userChannel } from './channels'
import { db } from './db'
import { NotFoundError, parseInput } from './errors'

const log = logger.child({ module: 'notifications' })

/** Selects exactly the `Notification` DTO; the row is the DTO, so drift fails to compile. */
const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  url: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>

const toNotification = (row: NotificationRow): Notification => row

const countUnread = (userId: string) => {
  return db.notification.count({ where: { userId, readAt: null } })
}

const publishUnread = async (userId: string) => {
  await publish(userChannel(userId), { type: 'unread', count: await countUnread(userId) })
}

/**
 * Internal: no `requireUser()`. It is called by DAL functions after their own checks (e.g.
 * `createComment` once the comment is written), never from a page, action or handler. Writes the
 * row, publishes it on the recipient's channel (best effort) and, when Web Push is configured,
 * queues a push without waiting for it.
 */
export const createNotification = async (input: CreateNotificationInput): Promise<Notification> => {
  const data = parseInput(createNotificationInput, input)
  const row = await db.notification.create({ data, select: notificationSelect })
  const notification = toNotification(row)
  await publish(userChannel(data.userId), { type: 'notification', notification })
  if (isPushConfigured()) {
    const { userId, title, body, url } = data
    enqueue('send-push', { userId, title, body, url }).catch((error) => {
      log.error({ err: error, notificationId: row.id }, 'push not queued')
    })
  }
  return notification
}

/** The viewer's notifications, newest first. Never cached: it is per viewer. */
export const listNotifications = async (
  query: ListNotificationsQuery,
): Promise<Page<Notification>> => {
  const viewer = await requireUser()
  const { page, perPage } = parseInput(listNotificationsQuery, query)
  const where = { userId: viewer.id }
  const [rows, totalItems] = await Promise.all([
    db.notification.findMany({
      where,
      select: notificationSelect,
      orderBy: { id: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.notification.count({ where }),
  ])
  return toPage(rows.map(toNotification), totalItems, { page, perPage })
}

export const getUnreadNotificationCount = async (): Promise<number> => {
  const viewer = await requireUser()
  return countUnread(viewer.id)
}

/**
 * Signed in (401) → the notification is the viewer's (404: it is a read of their own inbox, so
 * someone else's looks missing). Already read is a no-op. Publishes the new count so other tabs
 * follow.
 */
export const markNotificationRead = async (id: number | string): Promise<Notification> => {
  const viewer = await requireUser()
  const parsed = idSchema.safeParse(id)
  const row = parsed.success
    ? await db.notification.findFirst({
        where: { id: parsed.data, userId: viewer.id },
        select: notificationSelect,
      })
    : null
  if (!row) {
    throw new NotFoundError('Notification not found')
  }
  if (row.readAt) {
    return toNotification(row)
  }
  const readAt = new Date()
  await db.notification.updateMany({ where: { id: row.id, readAt: null }, data: { readAt } })
  await publishUnread(viewer.id)
  return { ...toNotification(row), readAt }
}

/** Marks every unread notification of the viewer read; returns how many changed. */
export const markAllNotificationsRead = async (): Promise<number> => {
  const viewer = await requireUser()
  const { count } = await db.notification.updateMany({
    where: { userId: viewer.id, readAt: null },
    data: { readAt: new Date() },
  })
  if (count > 0) {
    await publishUnread(viewer.id)
  }
  return count
}

/**
 * Attaches `listener` to the viewer's channel (401 when signed out) and returns the current
 * unread count with it, so the events route can open a stream with one auth check. The caller
 * must call `unsubscribe` when the stream ends.
 */
export const subscribeToNotifications = async (
  listener: RealtimeListener,
): Promise<{ unreadCount: number; unsubscribe: () => void }> => {
  const viewer = await requireUser()
  const unsubscribe = await subscribe(userChannel(viewer.id), listener)
  try {
    return { unreadCount: await countUnread(viewer.id), unsubscribe }
  } catch (error) {
    unsubscribe()
    throw error
  }
}
