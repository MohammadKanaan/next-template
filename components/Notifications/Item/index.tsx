'use client'

import clsx from 'clsx'
import Link from 'next/link'
import type { Notification } from '@/lib/dto/notifications'
import { formatDateTime } from '@/lib/formatDate'
import styles from './styles.module.scss'

export type NotificationItemProps = {
  notification: Notification
  /** Called when the viewer follows the notification (the caller marks it read). */
  onOpen: (notification: Notification) => void
}

export const NotificationItem = ({ notification, onOpen }: NotificationItemProps) => {
  const unread = notification.readAt === null
  return (
    <Link
      href={notification.url}
      className={clsx(styles.item, unread && styles.unread)}
      onClick={() => onOpen(notification)}
    >
      <span className={styles.title}>
        {notification.title}
        {unread && <span className={styles.srOnly}>Unread</span>}
      </span>
      {notification.body && <span className={styles.body}>{notification.body}</span>}
      <span className={styles.time}>{formatDateTime(notification.createdAt)}</span>
    </Link>
  )
}
