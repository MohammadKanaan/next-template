'use client'

import { useRouter } from 'next/navigation'
import { LoginForm } from '@/components/Auth/LoginForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/SCN/card'
import type { LoginFormValues } from '@/lib/validation/auth'
import { useUserStore } from '@/stores/user'
import styles from './styles.module.scss'

type LoginViewProps = {
  nextPath: string
}

export function LoginView({ nextPath }: LoginViewProps) {
  const router = useRouter()
  const createSession = useUserStore((s) => s.createSession)

  const handleSubmit = async ({ email }: LoginFormValues) => {
    const response = await createSession(email)
    if (response.success) {
      router.replace(nextPath)
      router.refresh()
    }
    return response
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Card>
          <CardHeader>
            <CardTitle>Log in</CardTitle>
            <CardDescription>Enter your email to start a session.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm onSubmit={handleSubmit} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
