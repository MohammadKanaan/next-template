import { BottomFooter } from '@/components/Layout/BottomFooter'
import { NavBar } from '@/components/Layout/NavBar'
import styles from './styles.module.scss'

export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className={styles.layout}>
      <NavBar />
      <main className={styles.main}>
        <div className={styles.container}>{children}</div>
      </main>
      <BottomFooter />
    </div>
  )
}
