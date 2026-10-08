import { z } from 'zod'
import { safeRedirectPath } from '@/lib/constants-routes'
import { cursorPageSchema, cursorQuerySchema } from './common'
import { userIdSchema } from './users'

export const notificationTypeSchema = z.enum(['comment'])

export type NotificationType = z.infer<typeof notificationTypeSchema>

export const NOTIFICATION_TITLE_MAX_LENGTH = 200
export const NOTIFICATION_BODY_MAX_LENGTH = 500
export const NOTIFICATION_URL_MAX_LENGTH = 500

/** One notification as the recipient sees it. `url` is an app path. */
export const notificationSchema = z.object({
  id: z.number().int(),
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string(),
  url: z.string(),
  readAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
})

export type Notification = z.infer<typeof notificationSchema>

export const notificationsPageSchema = cursorPageSchema(notificationSchema)

export const listNotificationsQuery = cursorQuerySchema

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuery>

/**
 * A same-origin app path, in the form a browser resolves to itself: it round-trips through
 * `safeRedirectPath`, so `/\evil.example`, `/<TAB>/evil.example` and `/.//evil.example` (which
 * browsers read as protocol-relative) are rejected, not just `//evil.example`.
 */
const appPathSchema = z
  .string()
  .max(NOTIFICATION_URL_MAX_LENGTH)
  .refine((value) => value.startsWith('/') && safeRedirectPath(value, '') === value, {
    message: 'Must be an app path',
  })

/** Internal input of `createNotification`: what a DAL function knows after its own checks. */
export const createNotificationInput = z.object({
  userId: userIdSchema,
  type: notificationTypeSchema,
  title: z.string().trim().min(1).max(NOTIFICATION_TITLE_MAX_LENGTH),
  body: z.string().trim().max(NOTIFICATION_BODY_MAX_LENGTH),
  url: appPathSchema,
})

export type CreateNotificationInput = z.infer<typeof createNotificationInput>

/**
 * What travels on a user's realtime channel. `unread` is the authoritative count (sent on every
 * connect and after every mark-as-read, so every tab self-heals); `notification` carries the full
 * record so the bell can show it without a fetch.
 */
export const realtimeEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('unread'), count: z.number().int().nonnegative() }),
  z.object({ type: z.literal('notification'), notification: notificationSchema }),
])

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>
