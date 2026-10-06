import { env } from '@/lib/env'
import styles from './styles.module.scss'

export const BottomFooter = () => {
  return (
    <footer className={styles.footer}>
      <p>
        {env.appName} © {new Date().getFullYear()}
      </p>
    </footer>
  )
}
