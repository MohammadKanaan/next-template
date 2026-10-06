import styles from './styles.module.scss'

const MinimalLayout = ({ children }: LayoutProps<'/'>) => {
  return <div className={styles.minimalContent}>{children}</div>
}

export default MinimalLayout
