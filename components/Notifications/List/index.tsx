'use client'

import { markNotificationReadAction } from '@/actions/notifications'
import { NotificationItem } from '@/components/Notifications/Item'
import type { Notification } from '@/lib/dto/notifications'
import styles from './styles.module.scss'

type NotificationListProps = {
  items: Notification[]
}

export const NotificationList = ({ items }: NotificationListProps) => {
  const handleOpen = (notification: Notification) => {
    if (notification.readAt === null) {
      // The navigation is already under way; the action refreshes the router when it lands.
      void markNotificationReadAction(notification.id)
    }
  }

  return (
    <ul className={styles.list}>
      {items.map((notification) => (
        <li key={notification.id}>
          <NotificationItem notification={notification} onOpen={handleOpen} />
        </li>
      ))}
    </ul>
  )
}
