import styles from './styles.module.scss'

export default function MinimalLayout({ children }: LayoutProps<'/'>) {
  return <div className={styles.minimalContent}>{children}</div>
}
