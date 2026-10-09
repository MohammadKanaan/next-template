'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { stopImpersonatingAction } from '@/actions/admin'
import { LoadingButton } from '@/components/LoadingButton'
import { ROUTE_ADMIN } from '@/lib/constants-routes'
import styles from './styles.module.scss'

type ImpersonationBannerProps = {
  /** The user this browser is signed in as. */
  name: string
}

/** Shown while an admin is impersonating someone (the session carries `impersonatedBy`). */
export const ImpersonationBanner = ({ name }: ImpersonationBannerProps) => {
  const [isPending, startTransition] = useTransition()

  const handleStop = () => {
    startTransition(async () => {
      const result = await stopImpersonatingAction()
      if (result.ok) {
        // The admin is signed in again: a full navigation renders every layout for them.
        window.location.assign(ROUTE_ADMIN)
      } else {
        toast.error(result.message)
      }
    })
  }

  return (
    <div className={styles.banner} role="status">
      <p className={styles.message}>
        You are signed in as <strong>{name}</strong>.
      </p>
      <LoadingButton
        type="button"
        variant="outline"
        size="sm"
        loading={isPending}
        onClick={handleStop}
      >
        Stop impersonating
      </LoadingButton>
    </div>
  )
}
