# Email

- `lib/server/mailer.ts`: `sendMail({ to, subject, html, text })`. With `RESEND_API_KEY` set it
  sends through Resend (an error throws); without it, outside production, it logs the recipient,
  subject and plain text, so the verification and reset links show up in the dev server output.
  In production a missing key throws and nothing from the message is logged (the text carries live
  reset and verification links).
- Templates live in `emails/` as plain functions that return `{ subject, html, text }`
  (`verifyEmail`, `resetPasswordEmail`, `confirmEmailChangeEmail`), all built by `buildEmail` in
  `emails/layout.ts`: one layout, inline styles (mail clients need them; the no-inline-style rule is
  for the web UI), every interpolated value through `escapeHtml`, and the action link on its own
  line of the plain text. No React, no rendering step, so an email can be built inside a request
  without a worker process. A new email is a new file in `emails/` and a test in `tests/emails/`.
- The only caller is Better Auth's config in `lib/data/auth.ts` (`deliver`): it sends without
  awaiting and logs a failure, because the caller's response time must not reveal whether an
  account exists. Links are built by Better Auth from `BETTER_AUTH_URL`.
- Tests never send mail: `tests/setup.ts` mocks `@/lib/server/mailer`, and `tests/helpers/mail.ts`
  reads the links and tokens back from the mock (`sentMails`, `linkOf`, `tokenOf`; await
  `flushMail()` first, since the send is not awaited). `tests/lib/server/mailer.test.ts` loads the
  real module with `vi.importActual`.
