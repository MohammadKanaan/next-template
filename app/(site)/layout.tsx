import { Suspense } from 'react'
import { BottomFooter } from '@/components/Layout/BottomFooter'
import { NavBar } from '@/components/Layout/NavBar'
import { getViewer } from '@/lib/data/users'
import styles from './styles.module.scss'

async function NavBarSlot() {
  const viewer = await getViewer()
  return <NavBar user={viewer} />
}

export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className={styles.layout}>
      <Suspense fallback={<NavBar user={null} pending />}>
        <NavBarSlot />
      </Suspense>
      <main className={styles.main}>
        <div className={styles.container}>{children}</div>
      </main>
      <BottomFooter />
    </div>
  )
}
