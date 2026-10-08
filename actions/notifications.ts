'use server'

import { refresh } from 'next/cache'
import { toActionFailure } from '@/lib/data/errors'
import { markAllNotificationsRead, markNotificationRead } from '@/lib/data/notifications'
import type { Notification } from '@/lib/dto/notifications'
import type { ActionResult } from '@/types/api'

export const markNotificationReadAction = async (
  id: number,
): Promise<ActionResult<Notification>> => {
  try {
    const notification = await markNotificationRead(id)
    refresh()
    return { ok: true, data: notification }
  } catch (error) {
    return toActionFailure(error)
  }
}

/** Returns how many notifications changed. */
export const markAllNotificationsReadAction = async (): Promise<ActionResult<number>> => {
  try {
    const count = await markAllNotificationsRead()
    refresh()
    return { ok: true, data: count }
  } catch (error) {
    return toActionFailure(error)
  }
}
