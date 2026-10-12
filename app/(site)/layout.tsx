import { ImpersonationBanner } from '@/components/Auth/ImpersonationBanner'
import { VerifyEmailBanner } from '@/components/Auth/VerifyEmailBanner'
import { BottomFooter } from '@/components/Layout/BottomFooter'
import { NavBar } from '@/components/Layout/NavBar'
import { getSessionUser } from '@/lib/data/auth'
import { getViewer } from '@/lib/data/users'
import styles from './styles.module.scss'

const MAIN_ID = 'main'

const SiteLayout = async ({ children }: LayoutProps<'/'>) => {
  // Both read the same session once per request (`cache`); the viewer is the cached user record.
  const [viewer, session] = await Promise.all([getViewer(), getSessionUser()])

  return (
    <div className={styles.layout}>
      {/* The first stop for the keyboard: past the navigation, straight to the page. */}
      <a href={`#${MAIN_ID}`} className={styles.skipLink}>
        Skip to content
      </a>
      <NavBar user={viewer} />
      {viewer && session?.impersonatedBy && <ImpersonationBanner name={viewer.name} />}
      {viewer && !viewer.emailVerified && <VerifyEmailBanner email={viewer.email} />}
      <main id={MAIN_ID} className={styles.main} tabIndex={-1}>
        <div className={styles.container}>{children}</div>
      </main>
      <BottomFooter />
    </div>
  )
}

export default SiteLayout
