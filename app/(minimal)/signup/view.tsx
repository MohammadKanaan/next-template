'use client'

import { useRouter } from 'next/navigation'
import { signUpAction } from '@/actions/auth'
import { SignUpForm } from '@/components/Auth/SignUpForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/SCN/card'
import type { SignUpInput } from '@/lib/dto/auth'
import styles from '../login/styles.module.scss'

type SignUpViewProps = {
  nextPath: string
}

export const SignUpView = ({ nextPath }: SignUpViewProps) => {
  const router = useRouter()

  const handleSubmit = async (values: SignUpInput) => {
    const result = await signUpAction(values)
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
            <CardTitle>Create an account</CardTitle>
            <CardDescription>Sign up with your email and a password.</CardDescription>
          </CardHeader>
          <CardContent>
            <SignUpForm onSubmit={handleSubmit} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
