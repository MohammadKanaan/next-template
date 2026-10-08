import type { CursorPage } from '@/lib/dto/common'
import {
  notificationsPageSchema,
  type ListNotificationsQuery,
  type Notification,
} from '@/lib/dto/notifications'
import { getJson } from './getJson'

/** Client facade for `GET /api/v1/notifications`; returns the same `CursorPage<Notification>` as the DAL. */
export const fetchNotifications = async (
  query: Partial<ListNotificationsQuery>,
  signal?: AbortSignal,
): Promise<CursorPage<Notification>> => {
  return getJson('/notifications', query, notificationsPageSchema, signal)
}
