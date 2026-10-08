import { z } from 'zod'
import type { Page } from '@/lib/dto/common'
import {
  notificationsPageSchema,
  type ListNotificationsQuery,
  type Notification,
} from '@/lib/dto/notifications'
import { env } from '@/lib/env'
import { RequestError } from './errors'

const errorMessageSchema = z.object({ message: z.string() })

/** Client facade for `GET /api/v1/notifications`; returns the same `Page<Notification>` as the DAL. */
export const fetchNotifications = async (
  query: ListNotificationsQuery,
  signal?: AbortSignal,
): Promise<Page<Notification>> => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value))
    }
  }
  const response = await fetch(`${env.apiBaseUrl}/notifications?${params}`, { signal })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const parsed = errorMessageSchema.safeParse(body)
    throw new RequestError(
      parsed.success ? parsed.data.message : `Request failed (${response.status})`,
      response.status,
    )
  }
  return notificationsPageSchema.parse(body)
}
