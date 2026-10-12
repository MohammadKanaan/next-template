'use client'

import { useRouter } from 'next/navigation'
import { signUpAction } from '@/actions/auth'
import { AuthHeader } from '@/components/Auth/AuthHeader'
import { GoogleButton } from '@/components/Auth/GoogleButton'
import { SignUpForm } from '@/components/Auth/SignUpForm'
import { Card, CardContent } from '@/components/SCN/card'
import { useReturnPath } from '@/hooks/useReturnPath'
import type { SignUpInput } from '@/lib/dto/auth'
import styles from '../login/styles.module.scss'

type SignUpViewProps = {
  nextPath: string
  googleEnabled: boolean
}

export const SignUpView = ({ nextPath, googleEnabled }: SignUpViewProps) => {
  const router = useRouter()
  const { resolve, clear } = useReturnPath()
  const target = resolve(nextPath)

  const handleSubmit = async (values: SignUpInput) => {
    const result = await signUpAction(values)
    if (result.ok) {
      clear()
      // A Route Handler (such as an email link under `/api/`) is not an app page: the client
      // router cannot render it, so the browser must navigate to it.
      const isRouteHandler = target.startsWith('/api/')
      if (isRouteHandler) {
        window.location.assign(target)
      } else {
        router.replace(target)
      }
    }
    return result
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Card>
          <CardContent>
            <AuthHeader
              title="Create an account"
              description="Sign up with your email and a password."
            />
            <SignUpForm onSubmit={handleSubmit} />
            {googleEnabled && <GoogleButton nextPath={target} />}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
