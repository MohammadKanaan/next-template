'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { resendVerificationAction } from '@/actions/auth'
import { LoadingButton } from '@/components/LoadingButton'
import styles from './styles.module.scss'

type VerifyEmailBannerProps = {
  email: string
}

/** Soft nag for a signed-in user whose email is not verified yet; sign-in is not blocked. */
export const VerifyEmailBanner = ({ email }: VerifyEmailBannerProps) => {
  const [isPending, startTransition] = useTransition()

  const handleResend = () => {
    startTransition(async () => {
      const result = await resendVerificationAction()
      if (result.ok) {
        toast.success('Verification email sent')
      } else {
        toast.error(result.message)
      }
    })
  }

  return (
    <div className={styles.banner} role="status">
      <p className={styles.message}>
        Confirm your email address. We sent a link to <strong>{email}</strong>.
      </p>
      <LoadingButton
        type="button"
        variant="outline"
        size="sm"
        loading={isPending}
        onClick={handleResend}
      >
        Resend
      </LoadingButton>
    </div>
  )
}
