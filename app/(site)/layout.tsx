import { VerifyEmailBanner } from '@/components/Auth/VerifyEmailBanner'
import { BottomFooter } from '@/components/Layout/BottomFooter'
import { NavBar } from '@/components/Layout/NavBar'
import { getViewer } from '@/lib/data/users'
import styles from './styles.module.scss'

const SiteLayout = async ({ children }: LayoutProps<'/'>) => {
  const viewer = await getViewer()

  return (
    <div className={styles.layout}>
      <NavBar user={viewer} />
      {viewer && !viewer.emailVerified && <VerifyEmailBanner email={viewer.email} />}
      <main className={styles.main}>
        <div className={styles.container}>{children}</div>
      </main>
      <BottomFooter />
    </div>
  )
}

export default SiteLayout
