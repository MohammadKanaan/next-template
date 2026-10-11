import { buildEmail, type EmailMessage } from './layout'

export type VerifyEmailProps = { name: string; url: string }

/** Sent on sign-up and from the "Resend" button of the verify banner. */
export const verifyEmail = ({ name, url }: VerifyEmailProps): EmailMessage =>
  buildEmail({
    subject: 'Verify your email',
    greeting: `Hi ${name},`,
    paragraphs: ['Confirm your email address to finish setting up your account.'],
    action: { label: 'Verify email', url },
    footnote: 'If you did not create an account, you can ignore this email.',
  })
