'use client'

import { useRouter } from 'next/navigation'
import { signInAction } from '@/actions/auth'
import { AuthHeader } from '@/components/Auth/AuthHeader'
import { GoogleButton } from '@/components/Auth/GoogleButton'
import { LoginForm } from '@/components/Auth/LoginForm'
import { Card, CardContent } from '@/components/ui/card'
import { useReturnPath } from '@/hooks/useReturnPath'
import type { SignInInput } from '@/lib/dto/auth'
import styles from './styles.module.scss'

type LoginViewProps = {
  nextPath: string
  googleEnabled: boolean
  /** The provider sign-in came back with an error (`?error=` on the page). */
  signInFailed?: boolean
}

export const LoginView = ({ nextPath, googleEnabled, signInFailed }: LoginViewProps) => {
  const router = useRouter()
  const { resolve, clear } = useReturnPath()
  const target = resolve(nextPath)

  const handleSubmit = async (values: SignInInput) => {
    const result = await signInAction(values)
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
            <AuthHeader title="Log in" description="Use your email and password." />
            {signInFailed && (
              <p className={styles.error} role="alert">
                Sign-in with Google could not be completed. Try again or use your password.
              </p>
            )}
            <LoginForm onSubmit={handleSubmit} />
            {googleEnabled && <GoogleButton nextPath={target} />}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
