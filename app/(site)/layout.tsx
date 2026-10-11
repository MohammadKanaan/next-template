import { ImpersonationBanner } from '@/components/Auth/ImpersonationBanner'
import { VerifyEmailBanner } from '@/components/Auth/VerifyEmailBanner'
import { BottomFooter } from '@/components/Layout/BottomFooter'
import { NavBar } from '@/components/Layout/NavBar'
import { getSessionUser } from '@/lib/data/auth'
import { getViewer } from '@/lib/data/users'
import styles from './styles.module.scss'

const SiteLayout = async ({ children }: LayoutProps<'/'>) => {
  // Both read the same session once per request (`cache`); the viewer is the cached user record.
  const [viewer, session] = await Promise.all([getViewer(), getSessionUser()])

  return (
    <div className={styles.layout}>
      <NavBar user={viewer} />
      {viewer && session?.impersonatedBy && <ImpersonationBanner name={viewer.name} />}
      {viewer && !viewer.emailVerified && <VerifyEmailBanner email={viewer.email} />}
      <main className={styles.main}>
        <div className={styles.container}>{children}</div>
      </main>
      <BottomFooter />
    </div>
  )
}

export default SiteLayout
