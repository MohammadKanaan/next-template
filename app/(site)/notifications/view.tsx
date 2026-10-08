'use client'

import { Empty } from '@/components/Empty'
import { NotificationList } from '@/components/Notifications/List'
import { MarkAllReadButton } from '@/components/Notifications/MarkAllReadButton'
import { Pagination } from '@/components/Pagination'
import { useUrlState } from '@/hooks/useUrlState'
import type { Page } from '@/lib/dto/common'
import { notificationsUrlQuery, type Notification } from '@/lib/dto/notifications'
import styles from './styles.module.scss'

type NotificationsViewProps = {
  notifications: Page<Notification>
}

export const NotificationsView = ({ notifications }: NotificationsViewProps) => {
  const { setState, isPending } = useUrlState(notificationsUrlQuery)
  const hasUnread = notifications.items.some((item) => item.readAt === null)

  return (
    <div className={styles.view}>
      {hasUnread && (
        <div className={styles.actions}>
          {/* The action refreshes the router, so the list re-renders read. */}
          <MarkAllReadButton />
        </div>
      )}
      {notifications.items.length === 0 ? (
        <Empty
          title="No notifications"
          description="You'll hear here when someone comments on your posts."
        />
      ) : (
        <NotificationList items={notifications.items} />
      )}
      <Pagination
        page={notifications.page}
        totalPages={notifications.totalPages}
        onPageChange={(page) => setState({ page })}
        disabled={isPending}
      />
    </div>
  )
}
