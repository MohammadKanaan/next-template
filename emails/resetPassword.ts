import { buildEmail, type EmailMessage } from './layout'

export type ResetPasswordProps = { name: string; url: string }

/** Sent by "Forgot password?"; the link opens `/reset-password` with the token. */
export const resetPasswordEmail = ({ name, url }: ResetPasswordProps): EmailMessage =>
  buildEmail({
    subject: 'Reset your password',
    greeting: `Hi ${name},`,
    paragraphs: [
      'Someone asked to reset the password of your account. Use the link below to pick a new one.',
    ],
    action: { label: 'Reset password', url },
    footnote:
      'The link expires in one hour. If you did not ask for this, you can ignore this email.',
  })
