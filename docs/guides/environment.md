# Environment & Config

- Public config comes from `NEXT_PUBLIC_*` variables read once in `lib/env.ts` — do not hardcode
  URLs or app names.
- `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` live in `.env` (dev) and `.env.test`
  (tests). Both are untracked; update the `*.example` files when adding a variable.
  `assertAuthEnv()` (`lib/server/env.ts`, called by `instrumentation.ts` in production) rejects a
  missing or placeholder secret (under 32 characters, the old `.env.example` value, or the
  build-only placeholder from the `Dockerfile` and CI) and a missing or relative
  `BETTER_AUTH_URL`; `.env.example` ships an empty secret you must generate.
- `LOG_LEVEL` (optional) is read directly by `lib/server/logger.ts`, not through `serverEnv()`.
- **Security headers** live in `next.config.ts` (`SECURITY_HEADERS`, served on every path) and
  `poweredByHeader` is off. `frame-ancestors 'none'` is the only CSP directive (a script policy would
  need nonces for Next's inline runtime). Changing the file calls for `bun run build` (see
  **Verifying Changes**).
- Server-only config (`REDIS_URL`, `EMAIL_FROM`, `RESEND_API_KEY` (optional), `TRUSTED_PROXY_HOPS`
  (optional, default 1: how many proxies append to `x-forwarded-for`, read by `getClientIp`),
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (optional pair)) is read through `serverEnv()` in
  `lib/server/env.ts`: Zod-validated, parsed on first use (so `next build` works without it), one
  error listing every bad variable. An empty optional variable counts as unset. In production
  `instrumentation.ts` and the worker's start call it at boot, so a bad config fails loudly instead
  of degrading the rate limiter or cache. Never read these from `process.env` elsewhere (the one exception is the Google
  pair, which `lib/data/auth.ts` reads directly; see **Authentication**).
- `.env.test` points `REDIS_URL` at **database 15**; the test helpers flush it and refuse to run
  against any other database.
