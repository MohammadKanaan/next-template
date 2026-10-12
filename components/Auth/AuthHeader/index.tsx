import styles from './styles.module.scss'

type AuthHeaderProps = {
  title: string
  description: string
}

/** The page heading above an auth form: the page's one h1 and what the page is for. */
export const AuthHeader = ({ title, description }: AuthHeaderProps) => {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.description}>{description}</p>
    </header>
  )
}
