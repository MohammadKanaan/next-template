# Authentication

- **Better Auth**, email + password, with the official Prisma adapter and the `nextCookies` plugin
  (always the last plugin). Sessions are database rows; the session cookie is set by Better Auth.
  `role` (`user` / `admin`) is an additional user field, not settable from sign-up input.
- Email flows: sign-up sends a verification email, "Forgot password?" sends a reset email, both
  through the `send-email` job (see **Email**). Verification is **soft**
  (`requireEmailVerification: false`): unverified users can sign in and see `VerifyEmailBanner`
  with a Resend button; opening the verification link only marks the address verified, it never
  signs the browser in. Either change-email link (the confirmation to the current address and the
  verification of the new one both carry `updateTo`) opened without the account's session (Better
  Auth would otherwise create one for the opener) is sent to `/login?next=<the link>` by a `hooks.before`
  middleware and completes after sign-in; the login and signup views navigate to a `/api/` target
  with `window.location.assign`. Password reset revokes every session (`revokeSessionsOnPasswordReset`).
  Actions: `requestPasswordResetAction` (always `ok`, so it cannot enumerate accounts),
  `resetPasswordAction`, `resendVerificationAction`; pages `/forgot-password` and
  `/reset-password` in `(minimal)`. Better Auth enqueues emails without awaiting, so response time
  does not reveal whether an account exists.
- **Account settings** (`/settings`, a stack of cards): `updateProfileAction` (`actions/users.ts`:
  name, username, website; a taken username is a field error from the DAL), and in
  `actions/auth.ts` `changePasswordAction` (`auth.api.changePassword` with `revokeOtherSessions`,
  so this browser stays signed in and every other session ends), `changeEmailAction`,
  `revokeSessionAction`, `revokeOtherSessionsAction` and `deleteAccountAction`. Each parses its
  input, requires a session, is rate limited per user and `refresh()`es.
  - **Change email:** `user.changeEmail` is enabled. A verified user gets a `confirm-email-change`
    email at the **current** address (`sendChangeEmailConfirmation`); following it makes Better Auth
    send the usual verification email to the **new** address (`sendVerificationEmail`), and opening
    that switches the address. Both links, the confirmation as well (its token carries `updateTo`
    too), complete only in a browser that holds the account's session; otherwise the
    `hooks.before` middleware sends the opener to `/login?next=<the link>` first. An unverified user
    skips the first step. A taken address gets the
    same response and no email, so it cannot enumerate accounts; the action itself only rejects the
    user's own address.
  - **Delete account:** `user.deleteUser` is enabled. `beforeDelete` queues `delete-object` for each
    of the user's upload keys (the rows cascade, the objects would be orphaned), delayed with
    `startAfter` past the ticket lifetime plus grace so an in-flight upload cannot outlive its job; `afterDelete`
    invalidates `POSTS_TAG` and the user's tag. Posts, sessions, accounts and uploads cascade.
  - **Sessions:** `lib/data/sessions.ts` (`listSessions`, `revokeSession`, `revokeOtherSessions`)
    works on the plain `sessions` rows, so deleting a row ends that session. `SessionUser` carries
    `sessionId` to mark the current one. `SessionSummary` never contains the token.
  - **Profile edits** go through `updateProfile` in `lib/data/users.ts`, which invalidates the cached
    viewer and `POSTS_TAG` (cached post lists embed the author's name and username).
- **Google sign-in (optional):** `socialProviders.google` is built only when `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` are both set. `lib/data/auth.ts` reads them from `process.env` directly
  (the config is built at import and `serverEnv()` is lazy and needs every variable), the same
  documented exception as `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL`; `serverEnv()` lists the pair as
  optional and rejects one without the other so production fails at boot. `isGoogleAuthEnabled()`
  (public, no auth: it only says what the login page can offer) feeds the `googleEnabled` prop of
  the login and signup views, which render `GoogleButton` only then. `signInWithGoogleAction(nextPath)`
  sanitizes the path with `safeRedirectPath`, calls `auth.api.signInSocial` and `redirect()`s; the
  callback `/api/auth/callback/google` runs through Better Auth's HTTP router and must not be added
  to `disabledPaths`. `mapProfileToUser` supplies the required unique `username` through
  `deriveUsername` (`lib/username.ts`: email local part reduced to `a-z0-9_`, trimmed, plus a random
  six-character suffix; always passes the sign-up rule). Account linking stays at the default
  (verified Google email and verified local email). A Google-only user has no `credential` account:
  `hasPassword()` (`lib/data/users.ts`) drives `/settings`, which then shows no password form or
  delete button and points to "Forgot password" (Better Auth's reset creates the credential
  account). The round trip with Google itself is not covered by tests.
- Only `lib/data/auth.ts`, `actions/auth.ts`, `app/api/auth/[...all]`, `proxy.ts`, and
  `prisma/seed.ts` (password hashing via `better-auth/crypto`) import `better-auth`. Everything else asks the DAL: `getSessionUser()`, `requireUser()`,
  `requireAdmin()`, `getViewer()`.
- `requireUser()` always **throws** `UnauthorizedError`; it never redirects. Pages wrap their reads
  in `loadPage(load, path)` (`lib/data/page.ts`), which turns `UnauthorizedError` into a redirect to
  `/login?next=…` and `NotFoundError` **and `ForbiddenError`** into `notFound()`, so a page the
  viewer may not see (the admin area) looks like one that does not exist.
- **Admin** (`/admin`, `ROUTE_ADMIN`, private by default): the first live use of `requireAdmin()`.
  `listUsers(query)` (name/username/email search, paginated, `postCount`) is never cached because
  it is viewer-restricted and carries emails; `setUserRole(id, role)` checks admin (401/403) →
  exists (404) → not the admin's own account (403) → update → `invalidateTags(userTag(id))`.
  Roles are read from the database session on every request, so a change applies on the target's
  next request. `setUserRoleAction` is the write; `page.tsx` reads `searchParams` with
  `usersUrlQuery` and `view.tsx` (table, role `Select`, search, `Pagination`)
  writes through `useUrlState`. `NavBar` shows an "Admin" link to admins only (cosmetic; the DAL is
  the guard). Better Auth's `admin` plugin is deliberately not used (see `docs/DECISIONS.md`).
- **Dashboard** (`/dashboard`, `ROUTE_DASHBOARD`, private; the default target after sign-in): the
  worked example of aggregate queries, in `lib/data/stats.ts` with DTOs in `lib/dto/stats.ts`.
  `getSiteStats()` (published posts, comments on them, tags in use) is public and cached under
  `POSTS_TAG`. `getMyStats()` requires a session (checked before the cache is touched) and returns
  the viewer's posts per status through Prisma `groupBy` (every status present, zero when empty) and
  the comments other people left on their posts; its key is per user (`user:<id>:stats`, tags
  `POSTS_TAG` + the user's tag), so one viewer's numbers never reach another. `getPostsPerDay(days)`
  is public: published posts per UTC day, zero-filled, oldest first, `days` 1 to 90 (default 30,
  validated so the cache key is bounded). The page loads all three in one `Promise.all` inside
  `loadPage`; `StatCard` (server) and `PostsPerDayChart` (the only client component, on the shadcn
  `chart` primitive over Recharts) render them.
- `proxy.ts` is optimistic only: it checks cookie _presence_ (`getSessionCookie`) to redirect
  private pages to `/login?next=…`. It has no guest-only redirect, because a stale cookie must not
  lock anyone out of `/login`; the `/login` and `/signup` pages call `getViewer()` and redirect
  signed-in users themselves. The real check is always in the DAL.
- Better Auth's HTTP router has `disabledPaths: ['/sign-up/email', '/update-user', '/delete-user',
'/delete-user/callback', '/sign-in/email', '/request-password-reset', '/send-verification-email',
'/change-password', '/change-email', '/verify-password']`
  (returns 404; the callback is inert while no deletion token is issued): sign-up goes only through `signUpAction` (validated with `signUpInput`, rate
  limited), profile edits only through `updateProfile` (the same username and name rules), and
  account deletion only through `deleteAccountAction`, because over HTTP a fresh session can delete
  without a password while the action always demands it. Sign-in, password-reset requests and
  verification-email requests go only through `signInAction`, `requestPasswordResetAction` and
  `resendVerificationAction`, because those enforce per-account limits (`sign-in:email`,
  `password-reset:email`, `resend-verification:user`) that the router would skip (it only has Better
  Auth's per-process limiter, whose client address trusts a spoofable `x-forwarded-for`). The same
  goes for the session-bound account changes: `/change-password`, `/change-email` and
  `/verify-password` (a password oracle for a stolen session) are reached only through
  `changePasswordAction` and `changeEmailAction`, which limit them per user (nothing calls
  `/verify-password` over HTTP). Direct `auth.api.*` calls from server code are unaffected. Remove
  an entry only together with the code that validates the same rules and enforces the same limits.
  The paths that stay enabled are the ones the email links and OAuth need (`/verify-email`,
  `/reset-password/:token`, `/reset-password`, `/sign-in/social`, `/callback/*`) plus session reads
  and sign-out.
- Auth and upload actions that an attacker could spam (`signInAction`, `signUpAction`,
  `requestPasswordResetAction`, `resetPasswordAction`, `resendVerificationAction`,
  `signInWithGoogleAction`, `createUploadAction`, and per user `updateProfileAction`, `changePasswordAction`,
  `changeEmailAction`, `revokeSessionAction`, `revokeOtherSessionsAction`, `deleteAccountAction`)
  are rate limited in production with `consumeRateLimit`
  (`lib/data/rateLimit.ts`, Redis-backed so the limits hold across instances), because Better
  Auth's own limiter only runs in its HTTP router. It fails open: if Redis is down the attempt is
  allowed and the error is logged. The per-IP limits read the client from `x-forwarded-for` through
  `getClientIp`, which assumes the app sits behind `TRUSTED_PROXY_HOPS` (default 1) proxies that
  append the client address: Next only fills that header when the client sent none, so a directly
  exposed server lets clients pick their own bucket.
  Content creation (`createPost`, `createComment`: 20 per minute per user) is limited inside the DAL
  instead, because the Server Action and the REST handler both reach it. So are changes to existing
  content: `requirePostChange` (update, status change, delete) and `deleteComment` allow 60 per
  minute per user, since each write can add tags and drops the cached lists.
- Better Auth's `databaseHooks.user.update.after` invalidates the cached viewer (`user:<id>`), so
  changes made inside Better Auth (e.g. email verification) show up immediately.
- Sessions refresh only through Server Actions or the auth route (Server Components cannot set
  cookies), so a user who only browses is signed out when the 7-day session expires.
- Client code never reads or sends a token; the cookie is httpOnly and travels on its own.
