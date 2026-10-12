'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { requestPasswordResetAction } from '@/actions/auth'
import { AuthHeader } from '@/components/Auth/AuthHeader'
import { ForgotPasswordForm } from '@/components/Auth/ForgotPasswordForm'
import { Card, CardContent } from '@/components/ui/card'
import { ROUTE_LOGIN } from '@/lib/constants-routes'
import type { RequestPasswordResetInput } from '@/lib/dto/auth'
import styles from '../login/styles.module.scss'

export const ForgotPasswordView = () => {
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
          <CardContent>
            <AuthHeader
              title="Forgot your password?"
              description="Enter your email and we will send you a reset link."
            />
            <ForgotPasswordForm onSubmit={handleSubmit} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
