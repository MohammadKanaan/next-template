import { vi } from 'vitest'
import type { JobPayload } from '@/jobs/definitions'
import { renderEmail } from '@/jobs/sendEmail'
import { enqueue } from '@/lib/server/queue'
import type { Mail } from '@/lib/server/mailer'

// `@/lib/server/queue` is mocked for every test in `tests/setup.ts`; these helpers read the
// `send-email` jobs the app queued and build the mails the worker would send. Better Auth queues
// without awaiting, so a test that needs the mail awaits `flushMail()` first.

/** Lets the un-awaited `enqueue` calls Better Auth makes land. */
export const flushMail = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

export const clearMail = () => {
  vi.mocked(enqueue).mockClear()
}

/** The `send-email` payloads queued since the last clear, oldest first. */
export const queuedEmails = (): JobPayload<'send-email'>[] =>
  vi
    .mocked(enqueue)
    .mock.calls.filter(([name]) => name === 'send-email')
    .map(([, payload]) => payload as JobPayload<'send-email'>)

/** Every mail queued since the last clear, as the worker would send it, oldest first. */
export const sentMails = (): Mail[] => queuedEmails().map(renderEmail)

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
