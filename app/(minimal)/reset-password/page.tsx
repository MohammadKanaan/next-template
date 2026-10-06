import type { Metadata } from 'next'
import { ResetPasswordView } from './view'

export const metadata: Metadata = {
  title: 'Reset password',
}

const ResetPasswordPage = async ({ searchParams }: PageProps<'/reset-password'>) => {
  const { token, error } = await searchParams
  // Better Auth sends `?error=INVALID_TOKEN` for an unknown or expired link, `?token=` otherwise.
  const validToken = typeof token === 'string' && token && !error ? token : null

  return <ResetPasswordView token={validToken} />
}

export default ResetPasswordPage
