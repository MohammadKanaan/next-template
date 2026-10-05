import { Inbox, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/SCN/button'
import { Spinner } from '@/components/SCN/spinner'
import styles from './styles.module.scss'

type PostsStateProps = {
  title?: string
  subtitle?: string
  loading?: boolean
  empty?: boolean
  emptyMessage?: string
  errorMessage?: string
  onRetry?: () => void
  children: ReactNode
}

export function PostsState({
  title,
  subtitle,
  loading = false,
  empty = false,
  emptyMessage = 'No posts yet.',
  errorMessage = '',
  onRetry,
  children,
}: PostsStateProps) {
  let content: ReactNode

  if (loading) {
    content = (
      <div className={styles.state}>
        <Spinner />
        <p className={styles.stateText}>Loading…</p>
      </div>
    )
  } else if (errorMessage) {
    content = (
      <div className={styles.state}>
        <TriangleAlert className={styles.icon} aria-hidden="true" />
        <p className={styles.stateText}>{errorMessage}</p>
        {onRetry && (
          <Button type="button" variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    )
  } else if (empty) {
    content = (
      <div className={styles.state}>
        <Inbox className={styles.icon} aria-hidden="true" />
        <p className={styles.stateText}>{emptyMessage}</p>
      </div>
    )
  } else {
    content = <div className={styles.content}>{children}</div>
  }

  return (
    <div className={styles.wrap}>
      {(title || subtitle) && (
        <header className={styles.header}>
          {title && <h1 className={styles.title}>{title}</h1>}
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </header>
      )}
      {content}
    </div>
  )
}
