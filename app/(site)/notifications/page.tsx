import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { ROUTE_NOTIFICATIONS } from '@/lib/constants-routes'
import { listNotifications } from '@/lib/data/notifications'
import { loadPage } from '@/lib/data/page'
import { NotificationsView } from './view'
import styles from './styles.module.scss'

export const metadata: Metadata = {
  title: 'Notifications',
}

const NotificationsPage = async () => {
  // The first page is rendered here; the view loads the rest as the reader scrolls.
  const notifications = await loadPage(() => listNotifications(), ROUTE_NOTIFICATIONS)

  return (
    <div className={styles.page}>
      <PageHeader title="Notifications" description="What happened to your posts." />
      <NotificationsView notifications={notifications} />
    </div>
  )
}

export default NotificationsPage
