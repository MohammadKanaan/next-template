'use client'

import { useState } from 'react'
import { Empty } from '@/components/Empty'
import { InfiniteSentinel } from '@/components/InfiniteSentinel'
import { LoadingButton } from '@/components/LoadingButton'
import { NotificationList } from '@/components/Notifications/List'
import { MarkAllReadButton } from '@/components/Notifications/MarkAllReadButton'
import { useInfiniteList } from '@/hooks/useInfiniteList'
import { fetchNotifications } from '@/lib/client/notifications'
import type { CursorPage } from '@/lib/dto/common'
import type { Notification } from '@/lib/dto/notifications'
import styles from './styles.module.scss'

type NotificationsViewProps = {
  notifications: CursorPage<Notification>
}

export const NotificationsView = ({ notifications }: NotificationsViewProps) => {
  const list = useInfiniteList(
    (cursor, signal) => fetchNotifications({ cursor: cursor ?? undefined }, signal),
    { initial: notifications },
  )
  // "Mark all read" refreshes the server-rendered page, but the loaded list keeps its own copy.
  const [markedAllAt, setMarkedAllAt] = useState<Date | null>(null)
  const items = markedAllAt
    ? list.items.map((item) => ({ ...item, readAt: item.readAt ?? markedAllAt }))
    : list.items
  const hasUnread = items.some((item) => item.readAt === null)

  return (
    <div className={styles.view}>
      {hasUnread && (
        <div className={styles.actions}>
          <MarkAllReadButton onMarked={() => setMarkedAllAt(new Date())} />
        </div>
      )}
      {items.length === 0 ? (
        <Empty
          title="No notifications"
          description="You'll hear here when someone comments on your posts."
        />
      ) : (
        <NotificationList items={items} />
      )}
      {list.error && (
        <p className={styles.error} role="alert">
          {list.error}
        </p>
      )}
      {list.hasMore && (
        <div className={styles.more}>
          <InfiniteSentinel onVisible={list.loadMore} disabled={list.isLoading || !!list.error} />
          <LoadingButton
            type="button"
            variant="outline"
            loading={list.isLoading}
            onClick={list.loadMore}
          >
            Load more
          </LoadingButton>
        </div>
      )}
    </div>
  )
}
