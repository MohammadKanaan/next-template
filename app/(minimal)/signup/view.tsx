'use client'

import { useRouter } from 'next/navigation'
import { signUpAction } from '@/actions/auth'
import { GoogleButton } from '@/components/Auth/GoogleButton'
import { SignUpForm } from '@/components/Auth/SignUpForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/SCN/card'
import type { SignUpInput } from '@/lib/dto/auth'
import styles from '../login/styles.module.scss'

type SignUpViewProps = {
  nextPath: string
  googleEnabled: boolean
}

export const SignUpView = ({ nextPath, googleEnabled }: SignUpViewProps) => {
  const router = useRouter()

  const handleSubmit = async (values: SignUpInput) => {
    const result = await signUpAction(values)
    if (result.ok) {
      // A Route Handler (such as an email link under `/api/`) is not an app page: the client
      // router cannot render it, so the browser must navigate to it.
      const isRouteHandler = nextPath.startsWith('/api/')
      if (isRouteHandler) {
        window.location.assign(nextPath)
      } else {
        router.replace(nextPath)
      }
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
            {googleEnabled && <GoogleButton nextPath={nextPath} />}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
