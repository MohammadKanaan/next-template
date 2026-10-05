import { Spinner } from '@/components/SCN/spinner'
import styles from './styles.module.scss'

/** Suspense fallback for a page section that waits on a request-time read. */
export function PageLoading() {
  return (
    <div className={styles.loading}>
      <Spinner />
    </div>
  )
}
