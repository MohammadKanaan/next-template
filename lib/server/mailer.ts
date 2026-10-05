import 'server-only'
import { render } from '@react-email/components'
import type { ReactElement } from 'react'
import { Resend } from 'resend'
import { serverEnv } from './env'

type Mail = {
  to: string
  subject: string
  react: ReactElement
}

let resend: Resend | undefined

/**
 * Sends one email. With `RESEND_API_KEY` set it goes through Resend; without it the subject, the
 * recipient and the rendered plain text (links included) are logged instead, so dev and tests need
 * no account. Throws when Resend rejects the message so the calling job is retried.
 */
export async function sendMail({ to, subject, react }: Mail): Promise<void> {
  const { RESEND_API_KEY, EMAIL_FROM } = serverEnv()
  const [html, text] = await Promise.all([render(react), render(react, { plainText: true })])

  if (!RESEND_API_KEY) {
    console.log(`[mailer] to: ${to}\n[mailer] subject: ${subject}\n${text}`)
    return
  }

  resend ??= new Resend(RESEND_API_KEY)
  const { error } = await resend.emails.send({ from: EMAIL_FROM, to, subject, html, text })
  if (error) {
    throw new Error(`Resend rejected the email (${error.name}): ${error.message}`)
  }
}
