import { Spinner } from '@/components/ui/spinner'
import styles from './styles.module.scss'

/** Suspense fallback for a page section that is still loading. */
export const PageLoading = () => {
  return (
    <div className={styles.loading}>
      <Spinner />
    </div>
  )
}
