import { BottomFooter } from '@/components/Layout/BottomFooter'
import { NavBar } from '@/components/Layout/NavBar'
import { getViewer } from '@/lib/data/users'
import styles from './styles.module.scss'

export default async function SiteLayout({ children }: LayoutProps<'/'>) {
  const viewer = await getViewer()

  return (
    <div className={styles.layout}>
      <NavBar user={viewer} />
      <main className={styles.main}>
        <div className={styles.container}>{children}</div>
      </main>
      <BottomFooter />
    </div>
  )
}
