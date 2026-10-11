import { confirmEmailChangeEmail } from '@/emails/confirmEmailChange'
import { resetPasswordEmail } from '@/emails/resetPassword'
import { verifyEmail } from '@/emails/verifyEmail'
import { sendMail, type Mail } from '@/lib/server/mailer'
import { jobs, type SendEmailPayload } from './definitions'

/** Builds the mail a payload describes: the template function for its `template`, plus `to`. */
export const renderEmail = (email: SendEmailPayload): Mail => {
  switch (email.template) {
    case 'verify-email':
      return { to: email.to, ...verifyEmail(email.props) }
    case 'reset-password':
      return { to: email.to, ...resetPasswordEmail(email.props) }
    case 'confirm-email-change':
      return { to: email.to, ...confirmEmailChangeEmail(email.props) }
  }
}

/** Re-validates the payload, builds the mail and sends it; a failure makes pg-boss retry. */
export const handleSendEmail = async (payload: unknown) => {
  await sendMail(renderEmail(jobs['send-email'].schema.parse(payload)))
}
