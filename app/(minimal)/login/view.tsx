'use client'

import { useRouter } from 'next/navigation'
import { signInAction } from '@/actions/auth'
import { GoogleButton } from '@/components/Auth/GoogleButton'
import { LoginForm } from '@/components/Auth/LoginForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/SCN/card'
import type { SignInInput } from '@/lib/dto/auth'
import styles from './styles.module.scss'

type LoginViewProps = {
  nextPath: string
  googleEnabled: boolean
}

export const LoginView = ({ nextPath, googleEnabled }: LoginViewProps) => {
  const router = useRouter()

  const handleSubmit = async (values: SignInInput) => {
    const result = await signInAction(values)
    if (result.ok) {
      router.replace(nextPath)
    }
    return result
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Card>
          <CardHeader>
            <CardTitle>Log in</CardTitle>
            <CardDescription>Use your email and password.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm onSubmit={handleSubmit} />
            {googleEnabled && <GoogleButton nextPath={nextPath} />}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
