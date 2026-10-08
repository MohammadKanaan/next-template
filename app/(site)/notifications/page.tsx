import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { ROUTE_NOTIFICATIONS } from '@/lib/constants-routes'
import { listNotifications } from '@/lib/data/notifications'
import { loadPage } from '@/lib/data/page'
import { notificationsUrlQuery } from '@/lib/dto/notifications'
import { toScalarParams } from '@/lib/searchParams'
import { NotificationsView } from './view'
import styles from './styles.module.scss'

const PER_PAGE = 20

export const metadata: Metadata = {
  title: 'Notifications',
}

const NotificationsPage = async ({ searchParams }: PageProps<'/notifications'>) => {
  // A garbled URL falls back to page 1, like the post lists.
  const query = notificationsUrlQuery.parse(toScalarParams(await searchParams))
  const notifications = await loadPage(
    () => listNotifications({ ...query, perPage: PER_PAGE }),
    ROUTE_NOTIFICATIONS,
  )

  return (
    <div className={styles.page}>
      <PageHeader title="Notifications" description="What happened to your posts." />
      <NotificationsView notifications={notifications} />
    </div>
  )
}

export default NotificationsPage
