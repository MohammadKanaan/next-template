# Authentication

- **Better Auth**, email + password, with the official Prisma adapter, the **`admin` plugin** and
  the `nextCookies` plugin (always the last plugin). Sessions are database rows; the session
  cookie is set by Better Auth. `username` is an additional user field validated with the sign-up
  rule; `role`, `banned`, `banReason`, `banExpires` (user) and `impersonatedBy` (session) are the
  admin plugin's fields.
- Email flows: sign-up sends a verification email, "Forgot password?" sends a reset email, both
  through the `send-email` job (see **Email**), queued without awaiting so response time does not
  reveal whether an account exists. Verification is **soft** (`requireEmailVerification: false`):
  unverified users can sign in and see `VerifyEmailBanner` with a Resend button; opening the
  verification link only marks the address verified, it never signs the browser in. Either
  change-email link (the confirmation to the current address and the verification of the new one
  both carry `updateTo`) opened without the account's session (Better Auth would otherwise create
  one for the opener) is sent to `/login?next=<the link>` by a `hooks.before` middleware and
  completes after sign-in; the login and signup views navigate to a `/api/` target with
  `window.location.assign`. Password reset revokes every session (`revokeSessionsOnPasswordReset`).
  Actions: `requestPasswordResetAction` (always `ok`, so it cannot enumerate accounts),
  `resetPasswordAction`, `resendVerificationAction`; pages `/forgot-password` and
  `/reset-password` in `(minimal)`.
- **Account settings** (`/settings`, a stack of cards): `updateProfileAction` (`actions/users.ts`:
  name, username, website; a taken username is a field error from the DAL), and in
  `actions/auth.ts` `changePasswordAction` (`auth.api.changePassword` with `revokeOtherSessions`,
  so this browser stays signed in and every other session ends), `changeEmailAction`,
  `revokeSessionAction`, `revokeOtherSessionsAction` and `deleteAccountAction`. Each parses its
  input, requires a session, is rate limited per user and `refresh()`es.
  - **Change email:** `user.changeEmail` is enabled. A verified user gets a confirmation email at
    the **current** address (`sendChangeEmailConfirmation`); following it makes Better Auth send
    the usual verification email to the **new** address (`sendVerificationEmail`), and opening
    that switches the address. Both links complete only in a browser that holds the account's
    session (the `hooks.before` middleware above). An unverified user skips the first step. A
    taken address gets the same response and no email; the action itself only rejects the user's
    own address.
  - **Delete account:** `user.deleteUser` is enabled; `deleteAccountAction` always demands the
    password. Posts, sessions and accounts cascade; `afterDelete` invalidates `POSTS_TAG` and the
    user's tag.
  - **Sessions:** `lib/data/sessions.ts` (`listSessions`, `revokeSession`, `revokeOtherSessions`)
    works on the plain `sessions` rows, so deleting a row ends that session. `SessionUser` carries
    `sessionId` to mark the current one. `SessionSummary` never contains the token.
- **Google sign-in (optional):** `socialProviders.google` is built only when `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` are both set. `lib/data/auth.ts` reads them from `process.env` directly
  (the config is built at import and `serverEnv()` is lazy and needs every variable), the same
  documented exception as `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL`; `serverEnv()` lists the pair as
  optional and rejects one without the other so production fails at boot. `isGoogleAuthEnabled()`
  feeds the `googleEnabled` prop of the login and signup views, which render `GoogleButton` only
  then. `signInWithGoogleAction(nextPath)` sanitizes the path with `safeRedirectPath`, calls
  `auth.api.signInSocial` and `redirect()`s; the callback `/api/auth/callback/google` runs through
  Better Auth's HTTP router and must not be added to `disabledPaths`. `mapProfileToUser` supplies
  the required unique `username` through `deriveUsername` (`lib/username.ts`). Account linking
  stays at the default (verified Google email and verified local email). A Google-only user has no
  `credential` account: `hasPassword()` drives `/settings`, which then shows no password form or
  delete button and points to "Forgot password" (Better Auth's reset creates the credential
  account). The round trip with Google itself is not covered by tests.
- Only `lib/data/auth.ts`, `lib/data/admin.ts`, `actions/auth.ts`, `app/api/auth/[...all]`,
  `proxy.ts` and `prisma/seed.ts` (password hashing via `better-auth/crypto`) import
  `better-auth`. Everything else asks the DAL: `getSessionUser()`, `requireUser()`,
  `requireAdmin()`, `getViewer()`.
- `requireUser()` always **throws** `UnauthorizedError`; it never redirects. Pages wrap their reads
  in `loadPage(load, path)` (`lib/data/page.ts`), which turns `UnauthorizedError` into a redirect to
  `/login?next=…` and `NotFoundError` **and `ForbiddenError`** into `notFound()`, so a page the
  viewer may not see (the admin area) looks like one that does not exist.
- **Roles and the admin plugin.** `admin({ defaultRole: 'user', adminRoles: ['admin'] })`. The
  plugin stores `role` as text (it allows comma-separated lists); `getSessionUser` narrows it with
  `roleSchema` and anything unknown reads as `user`, so an odd value can never grant more.
  `requireAdmin()` is `role === 'admin'`. A **banned** user cannot sign in (the plugin refuses to
  create a session, with `banReason` as the message) and `banUser` deletes their sessions.
  **Impersonation** opens a one-hour session for the target that carries `impersonatedBy`; the
  admin's own session waits in an `admin_session` cookie until `stopImpersonating`. The `(site)`
  layout shows `ImpersonationBanner` while `getSessionUser().impersonatedBy` is set.
- **Admin area** (`/admin`, `ROUTE_ADMIN`, private by default): `lib/data/admin.ts` is the DAL.
  `listUsers(query)` (name/username/email search, paginated, carries `banned` / `banReason`) is this
  app's own query and is never cached (viewer-restricted, carries emails). The writes wrap the
  plugin's server API behind `requireAdmin()` and this app's rules: `setUserRole` (not on the
  admin's own account, so the last admin cannot demote themselves) → `auth.api.setRole`;
  `banUser` / `unbanUser` → `auth.api.banUser` / `unbanUser` (the plugin refuses to ban yourself);
  `impersonateUser` → `auth.api.impersonateUser` (the plugin refuses other admins);
  `stopImpersonating`. The plugin's `APIError`s are mapped once (`fromAdminApi`): a missing user is
  404, a refusal is 403. `actions/admin.ts` are the actions; `app/(site)/admin/view.tsx` is the
  table (role `Select`, `BanUserDialog`, Unban, Impersonate; the viewer's own row has no actions).
  `NavBar` shows an "Admin" link to admins only (cosmetic; the DAL is the guard).
- `proxy.ts` is optimistic only: it checks cookie _presence_ (`getSessionCookie`) to redirect
  private pages to `/login?next=…`. It has no guest-only redirect, because a stale cookie must not
  lock anyone out of `/login`; the `/login` and `/signup` pages call `getViewer()` and redirect
  signed-in users themselves. The real check is always in the DAL.
- Better Auth's HTTP router has `disabledPaths` for `/sign-up/email`, `/update-user`,
  `/delete-user`, `/delete-user/callback`, `/sign-in/email`, `/request-password-reset`,
  `/send-verification-email`, `/change-password`, `/change-email`, `/verify-password` and every
  `/admin/*` route of the admin plugin (they answer 404): sign-up goes only through `signUpAction`
  (validated with `signUpInput`, rate limited), profile edits only through `updateProfile`,
  account deletion only through `deleteAccountAction` (over HTTP a fresh session can delete
  without a password), sign-in, password-reset and verification requests only through their
  actions (they enforce per-account limits the router would skip; Better Auth's own limiter is
  per process and trusts a spoofable client address), the session-bound account changes only
  through `changePasswordAction` and `changeEmailAction`, and the admin operations only through
  `lib/data/admin.ts` (which adds the own-account rule). Direct `auth.api.*` calls from server
  code are unaffected. Remove an entry only together with the code that enforces the same rules.
  The paths that stay enabled are the ones the email links and OAuth need (`/verify-email`,
  `/reset-password/:token`, `/reset-password`, `/sign-in/social`, `/callback/*`) plus session
  reads and sign-out.
- Auth and account actions that an attacker could spam (`signInAction`, `signUpAction`,
  `requestPasswordResetAction`, `resetPasswordAction`, `resendVerificationAction`,
  `signInWithGoogleAction`, and per user `updateProfileAction`, `changePasswordAction`,
  `changeEmailAction`, `revokeSessionAction`, `revokeOtherSessionsAction`, `deleteAccountAction`)
  are rate limited in production with `consumeRateLimit` (`lib/data/rateLimit.ts`, Redis-backed so
  the limits hold across instances). It fails open: if Redis is down the attempt is allowed and the
  error is logged. The per-IP limits read the client from `x-forwarded-for` through `getClientIp`,
  which assumes the app sits behind `TRUSTED_PROXY_HOPS` (default 1) proxies that append the
  client address. Content creation (`createPost`: 20 per minute per user) is limited inside the
  DAL instead, because the Server Action and the REST handler both reach it.
- Better Auth's `databaseHooks.user.update.after` invalidates the cached viewer (`user:<id>`), so
  changes made inside Better Auth (email verification, a role change, a ban) show up at once.
- Sessions refresh only through Server Actions or the auth route (Server Components cannot set
  cookies), so a user who only browses is signed out when the 7-day session expires.
- Client code never reads or sends a token; the cookie is httpOnly and travels on its own.
