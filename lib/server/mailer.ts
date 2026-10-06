import 'server-only'
import { render } from '@react-email/components'
import type { ReactElement } from 'react'
import { Resend } from 'resend'
import { serverEnv } from './env'
import { logger } from './logger'

type Mail = {
  to: string
  subject: string
  react: ReactElement
}

const log = logger.child({ module: 'mailer' })

let resend: Resend | undefined

/**
 * Sends one email. With `RESEND_API_KEY` set it goes through Resend; without it, outside
 * production, the subject, the recipient and the rendered plain text (links included) are logged
 * instead, so dev and tests need no account. In production a missing key throws (and logs nothing
 * from the message, since it carries live reset and verification links) so the job fails and is
 * retried visibly. Also throws when Resend rejects the message.
 */
export const sendMail = async ({ to, subject, react }: Mail): Promise<void> => {
  const { RESEND_API_KEY, EMAIL_FROM } = serverEnv()
  if (!RESEND_API_KEY && process.env.NODE_ENV === 'production') {
    throw new Error('RESEND_API_KEY is required in production: the email was not sent')
  }

  const [html, text] = await Promise.all([render(react), render(react, { plainText: true })])

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
