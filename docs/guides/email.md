# Email

- `lib/server/mailer.ts`: `sendMail({ to, subject, react })` renders HTML and plain text with React
  Email. With `RESEND_API_KEY` set it sends through Resend (a Resend error throws, so pg-boss
  retries); without it, outside production, it logs the recipient, subject and rendered text, so
  links show up in the worker console in development. In production a missing key throws and
  nothing from the message is logged (the text carries live reset and verification links).
- Templates live in `emails/` (`VerifyEmail`, `ResetPassword`, `ConfirmEmailChange`, shared
  `EmailLayout`). Email markup
  uses inline styles because mail clients need them; the no-inline-style rule is for the web UI.
- Nothing sends mail directly. Callers `enqueue('send-email', { template, to, props })`;
  `jobs/sendEmail.ts` maps the `template` of the discriminated-union payload to a component and a
  subject. A new email is a new union member, a new template, and a new case in the handler.
- Links are built in the web process (by Better Auth, from `BETTER_AUTH_URL`) and travel in the job
  payload; the worker never reads `BETTER_AUTH_URL`.
