import { Suspense } from 'react'
import { VerifyEmailBanner } from '@/components/Auth/VerifyEmailBanner'
import { BottomFooter } from '@/components/Layout/BottomFooter'
import { NavBar } from '@/components/Layout/NavBar'
import { getViewer } from '@/lib/data/users'
import styles from './styles.module.scss'

async function NavBarSlot() {
  const viewer = await getViewer()
  return <NavBar user={viewer} />
}

async function VerifyEmailBannerSlot() {
  const viewer = await getViewer()
  return viewer && !viewer.emailVerified ? <VerifyEmailBanner email={viewer.email} /> : null
}

export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className={styles.layout}>
      <Suspense fallback={<NavBar user={null} pending />}>
        <NavBarSlot />
      </Suspense>
      <Suspense fallback={null}>
        <VerifyEmailBannerSlot />
      </Suspense>
      <main className={styles.main}>
        <div className={styles.container}>{children}</div>
      </main>
      <BottomFooter />
    </div>
  )
}
