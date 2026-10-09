import { vi } from 'vitest'
import { sendMail, type Mail } from '@/lib/server/mailer'

// `@/lib/server/mailer` is mocked for every test in `tests/setup.ts`; these helpers read what the
// app asked it to send. Better Auth sends without awaiting, so a test that needs the mail awaits
// `flushMail()` first.

/** Lets the un-awaited `sendMail` calls Better Auth makes land. */
export const flushMail = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

export const clearMail = () => {
  vi.mocked(sendMail).mockClear()
}

/** Every mail sent since the last clear, oldest first. */
export const sentMails = (): Mail[] => vi.mocked(sendMail).mock.calls.map(([mail]) => mail)

/** The mails with this subject (`verifyEmail`, `resetPasswordEmail`, ... each have one). */
export const sentMailsWithSubject = (subject: string) =>
  sentMails().filter((mail) => mail.subject === subject)

/** The action link of a mail: the templates put it on its own line of the plain text. */
export const linkOf = (mail: Mail): string => {
  const match = mail.text.match(/(https?:\/\/\S+)/)
  if (!match) {
    throw new Error(`No link in the email "${mail.subject}"`)
  }
  return match[1]
}

/** The `token` query parameter of a mail's link. */
export const tokenOf = (mail: Mail): string => {
  const token = new URL(linkOf(mail)).searchParams.get('token')
  if (!token) {
    throw new Error(`No token in the link of the email "${mail.subject}"`)
  }
  return token
}
