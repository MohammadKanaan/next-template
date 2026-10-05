import { cacheLife } from 'next/cache'
import { env } from '@/lib/env'
import styles from './styles.module.scss'

export async function BottomFooter() {
  'use cache'
  cacheLife('days')

  return (
    <footer className={styles.footer}>
      <p>
        {env.appName} © {new Date().getFullYear()}
      </p>
    </footer>
  )
}
