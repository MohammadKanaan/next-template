import { buildEmail, type EmailMessage } from './layout'

export type ConfirmEmailChangeProps = { name: string; newEmail: string; url: string }

/** Sent to the current address when a verified user asks to change their email. */
export const confirmEmailChangeEmail = ({
  name,
  newEmail,
  url,
}: ConfirmEmailChangeProps): EmailMessage =>
  buildEmail({
    subject: 'Confirm your email change',
    greeting: `Hi ${name},`,
    paragraphs: [
      `You asked to change the email of your account to ${newEmail}. Confirm it from this address, and we will then send a verification link to the new one.`,
    ],
    action: { label: 'Confirm email change', url },
    footnote:
      'If you did not ask for this, change your password: someone else has access to your account.',
  })
