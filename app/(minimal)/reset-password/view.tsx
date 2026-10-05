'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { resetPasswordAction } from '@/actions/auth'
import { ResetPasswordForm } from '@/components/Auth/ResetPasswordForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/SCN/card'
import { ROUTE_FORGOT_PASSWORD, ROUTE_LOGIN } from '@/lib/constants-routes'
import type { ResetPasswordInput } from '@/lib/dto/auth'
import styles from '../login/styles.module.scss'

type ResetPasswordViewProps = {
  /** Null when the link carried no token or Better Auth flagged it invalid or expired. */
  token: string | null
}

export function ResetPasswordView({ token }: ResetPasswordViewProps) {
  const router = useRouter()

  const handleSubmit = async (values: ResetPasswordInput) => {
    const result = await resetPasswordAction(values)
    if (result.ok) {
      toast.success('Password updated. Log in with your new password.')
      router.replace(ROUTE_LOGIN)
    }
    return result
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Card>
          <CardHeader>
            <CardTitle>Reset your password</CardTitle>
            <CardDescription>
              {token ? 'Choose a new password.' : 'This reset link is invalid or has expired.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {token ? (
              <ResetPasswordForm token={token} onSubmit={handleSubmit} />
            ) : (
              <Link href={ROUTE_FORGOT_PASSWORD}>Request a new link</Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
