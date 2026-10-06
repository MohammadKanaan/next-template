'use client'

import { Empty } from '@/components/Empty'
import { Button } from '@/components/SCN/button'
import styles from './not-found.module.scss'

type ErrorPageProps = {
  reset: () => void
}

const ErrorPage = ({ reset }: ErrorPageProps) => {
  return (
    <div className={styles.container}>
      <Empty
        title="Something went wrong"
        description="An unexpected error occurred. You can try again."
        action={
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  )
}

export default ErrorPage
