'use client'

import { Bell } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import { markNotificationReadAction } from '@/actions/notifications'
import { NotificationItem } from '@/components/Notifications/Item'
import { MarkAllReadButton } from '@/components/Notifications/MarkAllReadButton'
import { Button } from '@/components/SCN/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/SCN/popover'
import { useRealtime } from '@/hooks/useRealtime'
import { fetchNotifications } from '@/lib/client/notifications'
import { ROUTE_NOTIFICATIONS } from '@/lib/constants-routes'
import type { Notification } from '@/lib/dto/notifications'
import styles from './styles.module.scss'

const PREVIEW_COUNT = 10
const BADGE_MAX = 99

type NotificationBellProps = {
  /** Rendered on the server, so the badge is right before the stream connects. */
  initialUnreadCount: number
}

export const NotificationBell = ({ initialUnreadCount }: NotificationBellProps) => {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [open, setOpen] = useState(false)
  // null until the popover was opened once.
  const [items, setItems] = useState<Notification[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useRealtime((event) => {
    if (event.type === 'unread') {
      setUnreadCount(event.count)
      return
    }
    setUnreadCount((count) => count + 1)
    setItems((current) =>
      current ? [event.notification, ...current].slice(0, PREVIEW_COUNT) : current,
    )
    toast(event.notification.title, { description: event.notification.body })
  })

  const load = async () => {
    setError(null)
    try {
      const page = await fetchNotifications({ limit: PREVIEW_COUNT })
      setItems(page.items)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load notifications')
    }
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      void load()
    }
  }

  const handleOpen = (notification: Notification) => {
    setOpen(false)
    if (notification.readAt !== null) {
      return
    }
    const readAt = new Date()
    setUnreadCount((count) => Math.max(0, count - 1))
    setItems(
      (current) =>
        current?.map((item) => (item.id === notification.id ? { ...item, readAt } : item)) ?? null,
    )
    void markNotificationReadAction(notification.id)
  }

  const handleMarkedAll = () => {
    const readAt = new Date()
    setUnreadCount(0)
    setItems(
      (current) => current?.map((item) => ({ ...item, readAt: item.readAt ?? readAt })) ?? null,
    )
  }

  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" aria-label={label}>
          <span className={styles.trigger}>
            <Bell aria-hidden="true" />
            {unreadCount > 0 && (
              <span className={styles.badge} aria-hidden="true">
                {unreadCount > BADGE_MAX ? `${BADGE_MAX}+` : unreadCount}
              </span>
            )}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <div className={styles.panel}>
          <div className={styles.header}>
            <span className={styles.heading}>Notifications</span>
            {unreadCount > 0 && <MarkAllReadButton size="sm" onMarked={handleMarkedAll} />}
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {items && items.length === 0 && (
            <p className={styles.empty}>You&apos;re all caught up.</p>
          )}
          {items && items.length > 0 && (
            <ul className={styles.list}>
              {items.map((notification) => (
                <li key={notification.id}>
                  <NotificationItem notification={notification} onOpen={handleOpen} />
                </li>
              ))}
            </ul>
          )}
          <Link
            href={ROUTE_NOTIFICATIONS}
            className={styles.viewAll}
            onClick={() => setOpen(false)}
          >
            View all
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
