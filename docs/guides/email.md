# Email

- Nothing sends mail in a request. Better Auth's callbacks in `lib/data/auth.ts` call
  `queueEmail({ template, to, props })`, which enqueues a `send-email` job without awaiting (the
  caller's response time must not reveal whether an account exists; a failure to queue is logged,
  never the payload, which carries a live link). The worker runs `jobs/sendEmail.ts`, which maps the
  payload's `template` to a function in `emails/` and hands the result to `sendMail`. A failed send
  throws, so pg-boss retries it. Links are built by Better Auth from `BETTER_AUTH_URL` in the web
  process and travel in the payload; the worker never reads that variable.
- Templates live in `emails/` as plain functions that return `{ subject, html, text }`
  (`verifyEmail`, `resetPasswordEmail`, `confirmEmailChangeEmail`), all built by `buildEmail` in
  `emails/layout.ts`: one layout, inline styles (mail clients need them; the no-inline-style rule is
  for the web UI), every interpolated value through `escapeHtml`, and the action link on its own
  line of the plain text. No React, no rendering step. A new email is a new file in `emails/`, a new
  member of `sendEmailPayload` in `jobs/definitions.ts`, a new case in `renderEmail`, and tests in
  `tests/emails/` and `tests/jobs/`.
- `lib/server/mailer.ts`: `sendMail({ to, subject, html, text })`. With `RESEND_API_KEY` set it
  sends through Resend (an error throws); without it, outside production, it logs the recipient,
  subject and plain text, so the verification and reset links show up in the worker's output
  (`bun run dev:worker`). In production a missing key throws and nothing from the message is logged.
- Tests never send mail or reach the queue: `tests/setup.ts` mocks `@/lib/server/queue`, and
  `tests/helpers/mail.ts` turns the queued payloads back into mails (`sentMails`, `linkOf`,
  `tokenOf`; await `flushMail()` first, since the enqueue is not awaited).
