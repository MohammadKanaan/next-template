'use client'

import { useState, useTransition } from 'react'
import { signInWithGoogleAction } from '@/actions/auth'
import { LoadingButton } from '@/components/LoadingButton'
import styles from './styles.module.scss'

export type GoogleButtonProps = {
  nextPath: string
}

/** Rendered only when the provider is configured (the page reads `isGoogleAuthEnabled()`). */
export const GoogleButton = ({ nextPath }: GoogleButtonProps) => {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleClick = () => {
    setError(null)
    startTransition(async () => {
      // On success the action redirects to Google and never returns.
      const result = await signInWithGoogleAction(nextPath)
      if (!result.ok) {
        setError(result.message)
      }
    })
  }

  return (
    <div className={styles.root}>
      <p className={styles.divider}>or</p>
      <LoadingButton type="button" variant="outline" loading={isPending} onClick={handleClick}>
        Continue with Google
      </LoadingButton>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
