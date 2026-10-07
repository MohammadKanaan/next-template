'use client'

import { Empty } from '@/components/Empty'
import { Button } from '@/components/SCN/button'
import styles from './not-found.module.scss'

type ErrorPageProps = {
  /** Re-fetches and re-renders the failed segment; `reset` would re-render without re-fetching. */
  retry: () => void
}

const ErrorPage = ({ retry }: ErrorPageProps) => {
  return (
    <div className={styles.container}>
      <Empty
        title="Something went wrong"
        description="An unexpected error occurred. You can try again."
        action={
          <Button type="button" onClick={retry}>
            Try again
          </Button>
        }
      />
    </div>
  )
}

export default ErrorPage
