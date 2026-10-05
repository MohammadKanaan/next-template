import styles from './styles.module.scss'

export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className={styles.main}>
      <div className={styles.container}>{children}</div>
    </main>
  )
}
