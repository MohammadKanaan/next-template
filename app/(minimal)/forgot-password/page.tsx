import type { Metadata } from 'next'
import { ForgotPasswordView } from './view'

export const metadata: Metadata = {
  title: 'Forgot password',
}

const ForgotPasswordPage = () => {
  return <ForgotPasswordView />
}

export default ForgotPasswordPage
