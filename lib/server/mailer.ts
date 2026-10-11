import 'server-only'
import { Resend } from 'resend'
import type { EmailMessage } from '@/emails/layout'
import { serverEnv } from './env'
import { logger } from './logger'

export type Mail = EmailMessage & { to: string }

const log = logger.child({ module: 'mailer' })

let resend: Resend | undefined

/**
 * Sends one email. With `RESEND_API_KEY` set it goes through Resend; without it, outside
 * production, the subject, the recipient and the plain text (links included) are logged instead,
 * so dev and tests need no account. In production a missing key throws (and logs nothing from the
 * message, since it carries live reset and verification links). Also throws when Resend rejects
 * the message; callers that must not block on it catch and log (`lib/data/auth.ts`).
 */
export const sendMail = async ({ to, subject, html, text }: Mail): Promise<void> => {
  const { RESEND_API_KEY, EMAIL_FROM } = serverEnv()
  if (!RESEND_API_KEY && process.env.NODE_ENV === 'production') {
    throw new Error('RESEND_API_KEY is required in production: the email was not sent')
  }

  if (!RESEND_API_KEY) {
    log.info({ to, subject }, text)
    return
  }

  resend ??= new Resend(RESEND_API_KEY)
  const { error } = await resend.emails.send({ from: EMAIL_FROM, to, subject, html, text })
  if (error) {
    throw new Error(`Resend rejected the email (${error.name}): ${error.message}`)
  }
}
