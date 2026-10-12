'use client'

import { RotateCcw } from 'lucide-react'
import { Empty } from '@/components/Empty'
import { Button } from '@/components/ui/button'
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
            <RotateCcw data-icon="inline-start" aria-hidden="true" />
            Try again
          </Button>
        }
      />
    </div>
  )
}

export default ErrorPage
