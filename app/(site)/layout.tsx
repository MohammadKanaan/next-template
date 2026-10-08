import { VerifyEmailBanner } from '@/components/Auth/VerifyEmailBanner'
import { BottomFooter } from '@/components/Layout/BottomFooter'
import { NavBar } from '@/components/Layout/NavBar'
import { getUnreadNotificationCount } from '@/lib/data/notifications'
import { getViewer } from '@/lib/data/users'
import styles from './styles.module.scss'

const SiteLayout = async ({ children }: LayoutProps<'/'>) => {
  const viewer = await getViewer()
  // Only a signed-in viewer has an inbox; the count seeds the bell before its stream connects.
  const unreadCount = viewer ? await getUnreadNotificationCount() : 0

  return (
    <div className={styles.layout}>
      <NavBar user={viewer} unreadCount={unreadCount} />
      {viewer && !viewer.emailVerified && <VerifyEmailBanner email={viewer.email} />}
      <main className={styles.main}>
        <div className={styles.container}>{children}</div>
      </main>
      <BottomFooter />
    </div>
  )
}

export default SiteLayout
