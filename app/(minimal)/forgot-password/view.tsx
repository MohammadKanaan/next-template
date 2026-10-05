'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { requestPasswordResetAction } from '@/actions/auth'
import { ForgotPasswordForm } from '@/components/Auth/ForgotPasswordForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/SCN/card'
import { ROUTE_LOGIN } from '@/lib/constants-routes'
import type { RequestPasswordResetInput } from '@/lib/dto/auth'
import styles from '../login/styles.module.scss'

export function ForgotPasswordView() {
  const router = useRouter()

  const handleSubmit = async (values: RequestPasswordResetInput) => {
    const result = await requestPasswordResetAction(values)
    if (result.ok) {
      toast.success('If an account exists for that email, a reset link is on its way.')
      router.replace(ROUTE_LOGIN)
    }
    return result
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Card>
          <CardHeader>
            <CardTitle>Forgot your password?</CardTitle>
            <CardDescription>Enter your email and we will send you a reset link.</CardDescription>
          </CardHeader>
          <CardContent>
            <ForgotPasswordForm onSubmit={handleSubmit} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
