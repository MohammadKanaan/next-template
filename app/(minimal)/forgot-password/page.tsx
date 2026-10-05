import type { Metadata } from 'next'
import { ForgotPasswordView } from './view'

export const metadata: Metadata = {
  title: 'Forgot password',
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordView />
}
