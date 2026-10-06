import { createElement } from 'react'
import { ConfirmEmailChange } from '@/emails/ConfirmEmailChange'
import { ResetPassword } from '@/emails/ResetPassword'
import { VerifyEmail } from '@/emails/VerifyEmail'
import { sendMail } from '@/lib/server/mailer'
import { jobs } from './definitions'

/** Maps a payload's `template` to its React Email component and subject, then sends it. */
export async function handleSendEmail(payload: unknown) {
  const email = jobs['send-email'].schema.parse(payload)
  switch (email.template) {
    case 'verify-email':
      return sendMail({
        to: email.to,
        subject: 'Verify your email',
        react: createElement(VerifyEmail, email.props),
      })
    case 'reset-password':
      return sendMail({
        to: email.to,
        subject: 'Reset your password',
        react: createElement(ResetPassword, email.props),
      })
    case 'confirm-email-change':
      return sendMail({
        to: email.to,
        subject: 'Confirm your email change',
        react: createElement(ConfirmEmailChange, email.props),
      })
  }
}
