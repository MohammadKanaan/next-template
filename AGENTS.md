<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — Next Template

## The One-Contract Rule

Every data path ends at the same DAL function and returns the same DTO type under the same auth rules:
Server Component → `lib/data`; Server Action (`actions/`) → `lib/data`; client facade (`lib/client`) → Route
Handler (`app/api/v1`) → `lib/data`. DTOs are Zod schemas in `lib/dto` (`z.infer` gives the types). The DAL is the
only code that touches Prisma, and it enforces auth itself (`requireUser()` / `requireAdmin()` plus inline
record-level rules), so a caller that forgets a check cannot bypass it.

## Locating Code

- Tests under `tests/` mirror the source tree: `tests/components/Posts/PostForm.test.tsx` ↔
  `components/Posts/Form/`. When a test fails, read the test file first, then look for the source
  at the mirrored path before searching.
- Search with `rg`/`grep` scoped to this repo — never search outside the project directory.
  `node_modules/next/dist/docs/` and `node_modules/@prisma/` are the exceptions when you need the
  installed library's documentation.

## Build & Run Commands

| Command                                    | Purpose                                                          |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `bun run dev`                              | Start the Next dev server                                        |
| `bun run build`                            | Production build                                                 |
| `bun run test`                             | Run all Vitest tests                                             |
| `bun run test tests/lib/dto/posts.test.ts` | Run a single test file                                           |
| `bun run test -t "formats validation"`     | Run tests matching a name pattern                                |
| `bun run lint`                             | ESLint                                                           |
| `bun run typecheck`                        | Generate the Prisma client and route types, then `tsc`           |
| `bun run format:check`                     | Prettier check                                                   |
| `bun run db:generate`                      | Regenerate the Prisma client into `generated/`                   |
| `bun run db:migrate`                       | Create + apply a migration to the dev DB, then regenerate        |
| `bun run db:deploy`                        | Apply pending migrations only (CI / production)                  |
| `bun run db:seed`                          | Seed the dev DB (4 users, 16 posts; password `password123`)      |
| `bun run db:reset`                         | Drop, re-migrate, and re-seed the dev DB (destroys its data)     |
| `bun run db:test:prepare`                  | Reset the test DB, apply migrations, install the `pgboss` schema |
| `bun run worker`                           | Start the background worker (pg-boss jobs and cron)              |
| `bun run dev:worker`                       | The worker with `tsx watch`, restarting on file changes          |

- **Package manager:** bun (pinned via `packageManager`). Do not use npm or yarn. Scripts run on
  Node, not the Bun runtime.
- `postinstall` runs `prisma generate` into the git-ignored `generated/` directory. Prisma 7 does
  not generate or seed automatically after `migrate dev` / `migrate reset`; the `db:*` scripts do
  it explicitly.

## Tech Stack

- **Framework:** Next.js 16 App Router / React 19 / TypeScript (strict mode)
- **UI primitives:** shadcn/ui on Radix, vendored as flat files in `components/SCN/`
- **Data layer:** server-only DAL in `lib/data`; Zod DTOs in `lib/dto`; Server Actions for writes
- **HTTP (client reads only):** `fetch` inside a typed facade in `lib/client`, parsed with the shared schema
- **Database:** Prisma ORM 7.10 (`prisma-client` generator, `@prisma/adapter-pg`) on PostgreSQL 18
- **Cache + rate limits:** Redis (`ioredis`) behind `lib/server`; Next Cache Components for pure UI
- **Jobs:** pg-boss on the same PostgreSQL, run by a separate worker process (`worker/`)
- **Email:** Resend + React Email templates (`emails/`), console transport without an API key
- **Storage:** S3-compatible (MinIO in dev) via presigned POST
- **Auth:** Better Auth (email + password, official Prisma adapter, `nextCookies`)
- **Forms:** React Hook Form + Zod 4
- **Styling:** Stock shadcn neutral tokens and Tailwind base styles in `styles/global.css`.
  SCSS CSS Modules beside application components; Tailwind utilities stay in `components/SCN`.
- **Testing:** Vitest + Testing Library (jsdom; server tests run in node against a real test DB)
- **Linting:** ESLint (`eslint-config-next` + `eslint-config-prettier`) + Prettier

## Project Structure

```
app/                     # App Router: route groups (site), (minimal); api/auth, api/v1, api/health
  (site)/<route>/        # page.tsx (Server Component) + view.tsx ('use client') + styles.module.scss
actions/                 # 'use server' Server Actions (posts.ts, auth.ts, uploads.ts)
components/              # React components (ComponentName/index.tsx + styles.module.scss)
components/SCN/          # shadcn/ui primitives (the only place Tailwind is allowed)
hooks/                   # Reusable React hooks (useXxx)
presenters/              # Override functions for views that need reshaped data
types/                   # Cross-cutting types (types/api.ts: ActionResult, ErrorBody, FieldErrors)
lib/                     # Pure helpers, constants, env, formErrors
lib/dto/                 # Zod schemas + inferred types (inputs and outputs); client- and server-safe
lib/data/                # Server-only DAL: db client, auth, errors, users, posts, uploads, health,
                         # page loader; maintenance is the system DAL (jobs only)
lib/server/              # Server-only infrastructure that is not the database: env, redis, cache,
                         # queue, mailer, storage
jobs/                    # Job definitions (name + Zod payload + options) and handlers
worker/                  # Background worker entry (pg-boss), tsconfig, test-DB migrate script
emails/                  # React Email templates
lib/client/              # Client facades that fetch a Route Handler and parse with a lib/dto schema
prisma/                  # schema.prisma, migrations, seed
generated/               # Generated Prisma client (git-ignored; `postinstall` regenerates it)
styles/                  # global.css: official shadcn theme tokens and Tailwind base styles
proxy.ts                 # Optimistic auth redirects (Next 16's renamed middleware)
tests/                   # Vitest tests mirroring the source structure
docs/DECISIONS.md        # Framework and library choices, with reasons
```

## TypeScript

- **Strict mode** is enabled.
- Prefer `type` over `interface`. `interface` is acceptable when extension or declaration merging
  is needed.
- Use `| null` union types for nullable fields, matching the database.
- Avoid `any` when a proper type or type guard is practical.
- **Zod schemas in `lib/dto` are the source of truth for types** (`z.infer`). Inputs
  (`createPostInput`) and outputs (`postSummarySchema`, `postDetailSchema`) are both schemas.
  Output schemas use `z.coerce.date()` so a client that parses JSON gets `Date` back.
- DTO variants are per operation (`PostSummary` for lists, `PostDetail` for one record), shaped by
  the DAL's Prisma `select`; the DAL maps rows to DTOs, so drift from the database fails to compile
  there.
- **No Prisma types outside `lib/data`** (and `prisma/`). ESLint enforces this with
  `no-restricted-imports`.
- Lists are `Page<T> = { items, page, perPage, totalItems, totalPages }` (`lib/dto/common.ts`).
- Cross-cutting result types (`ActionResult<T>`, `ErrorBody`, `FieldErrors`) live in `types/api.ts`.
- Path alias: use `@/` to reference the project root.

## React Components

- Function components with **named exports**. Next route files (`page.tsx`, `layout.tsx`,
  `not-found.tsx`, `route.ts`) use the default exports Next requires.
- **Server Components by default.** Add `'use client'` only for state, effects, event handlers, or
  browser APIs. Interactive route UI lives in a sibling `view.tsx`; `page.tsx` stays a Server
  Component that owns `metadata` and the static shell.
- **Cache Components are on** (`cacheComponents: true`), so request data may only be read inside
  `<Suspense>`: `page.tsx` renders an inner async component inside
  `<Suspense fallback={<PageLoading />}>` that awaits `params`/`searchParams` (Promises) and calls
  the DAL through `loadPage`. A page that only reads the session (login, signup) does the same
  with `getViewer()`. Any other component that calls a data function gets its own `<Suspense>`
  (see **Caching**).
- A route with no params and no data stays a plain static shell (`/posts/new`, `/ui-kit`).
- Component folders: `components/<Area>/<Name>/index.tsx` with a co-located `styles.module.scss`.
- Match the style of the file or directory you are editing — do not restructure opportunistically.
- In application code, do not cast with `as` inside JSX. Narrow or derive the value in the
  component body. Leave CLI-generated `components/SCN` code as upstream provides it.

## Styling

- `styles/global.css` is the single theme source: stock neutral `:root` / `.dark` tokens and the
  official Tailwind base layer. No secondary palette or token aliases that override shadcn.
- Outside `components/SCN`: semantic class names in CSS Modules, using shadcn tokens directly
  (`var(--foreground)`, `var(--muted-foreground)`, `var(--border)`, etc.). No Tailwind utilities,
  `@apply`, or inline `style` in application components unless the value is genuinely runtime-only.
- `components/SCN` contains official CLI-generated primitives. Keep them unchanged apart from
  Prettier formatting, including long class strings and upstream inline styles. Update/reinstall
  with `bunx shadcn@latest add <names> --overwrite --yes`, not local rewrites.
- Application callers do not pass `className`/`style` to reusable components. Put composition and
  named variants in application wrappers, not generated primitives.
- Form controls in `components/Form/Input` and `components/Form/Textarea` own `label`, `required`,
  and `error`, forwarding native props and React 19 `ref` to the stock controls. `LoadingButton`
  composes stock Button and Spinner. These behaviors must stay outside `components/SCN`.
- `Providers` uses `next-themes` with `attribute="class"`, system default, and transition suppression
  on theme changes. `ThemeToggle` offers light/dark/system; the stock Toaster follows the theme.

## Authentication

- **Better Auth**, email + password, with the official Prisma adapter and the `nextCookies` plugin
  (always the last plugin). Sessions are database rows; the session cookie is set by Better Auth.
  `role` (`user` / `admin`) is an additional user field, not settable from sign-up input.
- Email flows: sign-up sends a verification email, "Forgot password?" sends a reset email, both
  through the `send-email` job (see **Email**). Verification is **soft**
  (`requireEmailVerification: false`): unverified users can sign in and see `VerifyEmailBanner`
  with a Resend button. Password reset revokes every session (`revokeSessionsOnPasswordReset`).
  Actions: `requestPasswordResetAction` (always `ok`, so it cannot enumerate accounts),
  `resetPasswordAction`, `resendVerificationAction`; pages `/forgot-password` and
  `/reset-password` in `(minimal)`. Better Auth enqueues emails without awaiting, so response time
  does not reveal whether an account exists.
- Only `lib/data/auth.ts`, `actions/auth.ts`, `app/api/auth/[...all]`, `proxy.ts`, and
  `prisma/seed.ts` (password hashing via `better-auth/crypto`) import `better-auth`. Everything else asks the DAL: `getSessionUser()`, `requireUser()`,
  `requireAdmin()`, `getViewer()`.
- `requireUser()` always **throws** `UnauthorizedError`; it never redirects. Pages wrap their reads
  in `loadPage(load, path)` (`lib/data/page.ts`), which turns `UnauthorizedError` into a redirect to
  `/login?next=…` and `NotFoundError` into `notFound()`.
- `proxy.ts` is optimistic only: it checks cookie _presence_ (`getSessionCookie`) to redirect
  private pages to `/login?next=…`. It has no guest-only redirect, because a stale cookie must not
  lock anyone out of `/login`; the `/login` and `/signup` pages call `getViewer()` and redirect
  signed-in users themselves. The real check is always in the DAL.
- Better Auth's HTTP router has `disabledPaths: ['/sign-up/email', '/update-user']` (returns 404):
  sign-up goes only through `signUpAction` (validated with `signUpInput`, rate limited), and profile
  editing does not exist yet, so those endpoints would bypass our username and name rules. Direct
  `auth.api.*` calls from server code are unaffected. Remove an entry only together with the code
  that validates the same rules. Every other path stays enabled on purpose: the email links need
  `/verify-email` and `/reset-password/:token`, and both enforce the same password rules.
- Auth and upload actions that an attacker could spam (`signInAction`, `signUpAction`,
  `requestPasswordResetAction`, `resetPasswordAction`, `resendVerificationAction`,
  `createAvatarUploadAction`) are rate limited in production with `consumeRateLimit`
  (`lib/data/rateLimit.ts`, Redis-backed so the limits hold across instances), because Better
  Auth's own limiter only runs in its HTTP router. It fails open: if Redis is down the attempt is
  allowed and the error is logged.
- Better Auth's `databaseHooks.user.update.after` invalidates the cached viewer (`user:<id>`), so
  changes made inside Better Auth (e.g. email verification) show up immediately.
- Sessions refresh only through Server Actions or the auth route (Server Components cannot set
  cookies), so a user who only browses is signed out when the 7-day session expires.
- Client code never reads or sends a token; the cookie is httpOnly and travels on its own.

## Data Access Layer

- `lib/data/**` is the only code that imports `@/generated/prisma/*` or `@prisma/*`. Every file
  starts with `import 'server-only'`.
- Select exactly the columns a DTO needs (`satisfies Prisma.PostSelect`), map the row to the DTO,
  and return the DTO. Never return a Prisma row to a caller.
- Every function enforces auth itself: `requireUser()` / `requireAdmin()` plus inline record-level
  rules (e.g. a post may be changed by its author or an admin). For writes the order is signed in
  (401) → exists (404) → allowed (403).
- Failures are typed errors (see **Errors**), not return codes.
- Server Components call the DAL directly (wrapped in `loadPage` when they need the redirect /
  not-found behaviour). They never fetch the app's own Route Handlers. `loadPage` awaits
  `connection()` before it loads, so no page read ever runs while `next build` prerenders; a
  component that calls the DAL without `loadPage` (e.g. the NavBar's `getViewer()`) is session
  based and so is already request-time.
- `lib/data/health.ts` and `lib/data/maintenance.ts` are the two deliberate exceptions to "every
  function enforces auth": health is a public probe that returns only ok/fail per dependency, and
  maintenance is the system DAL for jobs (see **Jobs**).
- The seed (`prisma/seed.ts`) runs on plain Node outside Next, so it owns its own client rather than
  importing `lib/data`.

## Server Actions

- Writes go through `'use server'` files in `actions/`. Inputs are typed for callers but
  re-validated: anything can reach an action endpoint.
- Shape: `try { parseInput(schema, input) → DAL call → revalidatePath / refresh → { ok: true, data } }
catch (error) { return toActionFailure(error) }`. Return `ActionResult<T>`; never throw for
  expected failures.
- Auth actions (`signInAction`, `signUpAction`, `signOutAction`) call `auth.api.*` and `refresh()`.
- The calling view owns navigation and toasts; the form owns field errors.

## Route Handlers and client facades

- Use a Route Handler only when a client component must fetch (today: `GET /api/v1/posts`, the
  `/posts/csr` example). It stays thin: `parseInput` the query, call the DAL, return JSON or
  `toErrorResponse(error)`.
- The client calls it through a facade in `lib/client` (`fetchPosts`) that parses the response with
  the shared `lib/dto` schema and throws `RequestError` (message + status) on failure. Components do
  not call `fetch` directly.
- `/posts/csr` is the single live example of this path and has an end-to-end test.
- `GET /api/health` is the other Route Handler. It is for load balancers and container probes,
  not for the client facade: it awaits `connection()`, calls `checkHealth()` (database `SELECT 1`
  and Redis `PING`, each with a 2 s timeout) and returns 200 `{ status: 'ok', checks }` or 503
  `{ status: 'degraded', checks }`. It never includes error details.

## Errors

- The DAL throws `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, and `ValidationError`
  (all `DataError`s with a `code`). Anything else is a bug and propagates.
- Each caller translates once: Server Action → `toActionFailure` (`ActionResult` with `code`,
  `message`, optional `fieldErrors`; Next redirect/not-found errors are rethrown); Route Handler →
  `toErrorResponse` (401 / 403 / 404 / 422 with `ErrorBody`); page → `loadPage` (redirect to login or
  `notFound()`).
- Forms map failures with `applyActionErrors` (`lib/formErrors.ts`): field errors land on their
  fields, anything else on `root.server`.

## Caching

Two caches exist and they must not meet:

- **Redis data cache** (`remember()` in `lib/server/cache.ts`), used inside the DAL for data that is
  the same for every viewer.
- **Next Cache Components** (`'use cache'`), for pure or static UI only (today: `BottomFooter`).

Rules:

1. **Never put `'use cache'` on anything that reads data Redis caches** (any DAL call). Next would
   freeze a copy that Redis invalidation cannot reach.
2. **Wrap every component that calls a data function in `<Suspense fallback={…}>`** (use
   `components/PageLoading` for a page, a skeleton or `null` for a slot). Cache Components
   rejects uncached request data outside a boundary, and the boundary is what lets the static shell
   prerender.

How the DAL caches:

- `remember(key, { ttl, tags, schema }, load)`: reads the tag versions, builds a versioned key,
  returns the hit parsed with `schema` (the DTO's `z.coerce.date()` restores `Date`s), or runs
  `load()` and stores the JSON with a TTL. `invalidateTags(...tags)` bumps each tag's version, so
  old entries become unreachable at once and age out by TTL.
- Tags live in `lib/data/cacheTags.ts` (`POSTS_TAG`, `postTag(id)`, `userTag(id)`).
- Check auth first, then `remember()` only the viewer-independent part, then compute viewer-specific
  fields (`permissions`) after. Never cache something that varies by viewer under a shared key.
- **Invalidate inside the DAL**, right after the write succeeds, so a caller cannot forget
  (`createPost` / `updatePost` / `deletePost`, `attachAvatar`; Better Auth user updates via its
  database hook). Actions still call `revalidatePath` / `refresh()` for the router cache.
- Redis is an optimization, never a dependency: read, write, and invalidation errors are logged
  and the request falls through to the database. A `load()` that throws (e.g. `NotFoundError`) is
  never cached.

## Jobs

Background work runs on pg-boss (the same PostgreSQL, `pgboss` schema) in a separate worker process.

- **Definitions** (`jobs/definitions.ts`): one entry per job with its name, Zod payload schema,
  queue `options` (retries, backoff, expiry) and an optional `cron`. Payload types come from
  `z.infer` (`JobPayload<'send-email'>`). Today: `send-email`, `delete-object`, `cleanup` (hourly).
- **Enqueue** (`lib/server/queue.ts`): `enqueue(name, payload)` validates the payload with the job's
  schema and sends it through a lazily started send-only pg-boss instance (`migrate: false`,
  `supervise: false`, `schedule: false`). The web process never runs maintenance. Enqueue from the
  DAL or Better Auth callbacks, not from components.
- **Handlers** (`jobs/*.ts`): `handleXxx(payload: unknown)` re-parses the payload with the job's
  schema, then does the work. Register each in `worker/index.ts`.
- **Worker** (`worker/index.ts`, `bun run worker`): the only process that owns pg-boss. It runs the
  `pgboss` migrations, creates or updates each queue from its definition, schedules crons, runs the
  handlers, and drains on SIGTERM/SIGINT. It needs `DATABASE_URL` and the `lib/server` variables.
- It runs through `tsx --tsconfig worker/tsconfig.json`, which keeps the `@/` alias and maps
  `server-only` to an empty stub so shared server code loads outside Next. Do not use
  `--conditions=react-server`: it breaks `react-dom/server`, which React Email needs.
- **System DAL** (`lib/data/maintenance.ts`): job-only functions with no viewer, so no
  `requireUser()` (expired sessions and verifications, stale pending uploads). ESLint allows
  importing it from `jobs/**` (and tests) only. Anything a user can trigger belongs in a normal DAL
  file with auth.
- To add a job: definition → handler → register in `worker/index.ts` → tests in `tests/jobs/`.
  The global `tests/setup.ts` mocks `@/lib/server/queue`; only `queue.test.ts` uses the real one.

## Email

- `lib/server/mailer.ts`: `sendMail({ to, subject, react })` renders HTML and plain text with React
  Email. With `RESEND_API_KEY` set it sends through Resend (a Resend error throws, so pg-boss
  retries); without it, it logs the recipient, subject and rendered text, so links show up in the
  worker console in development.
- Templates live in `emails/` (`VerifyEmail`, `ResetPassword`, shared `EmailLayout`). Email markup
  uses inline styles because mail clients need them; the no-inline-style rule is for the web UI.
- Nothing sends mail directly. Callers `enqueue('send-email', { template, to, props })`;
  `jobs/sendEmail.ts` maps the `template` of the discriminated-union payload to a component and a
  subject. A new email is a new union member, a new template, and a new case in the handler.
- Links are built from `BETTER_AUTH_URL`; the worker must have the same value as the web process.

## Uploads

Files go straight from the browser to S3-compatible storage; the app only issues tickets and
records the result.

- `lib/server/storage.ts`: presigned **POST** (a presigned PUT cannot cap size) with
  `content-length-range` and `Content-Type` conditions, `headObject`, `deleteObject`,
  `publicUrl(key)`.
- The `Upload` table (`key` unique, `userId`, `purpose`, `contentType`, `size`, `status`
  `pending` | `attached`) tracks every object.
- `lib/data/uploads.ts`: `createAvatarUpload` (signed in → key `avatars/<userId>/<uuid>` → `pending`
  row → ticket) and `attachAvatar` (signed in → exists → owner, i.e. 401/404/403 → `headObject`
  re-checks size and type, deleting an object that broke the rules → mark `attached`, set
  `user.image`, delete the previous avatar's row and queue `delete-object` for its object →
  `invalidateTags(userTag)`).
- Orphans: the hourly `cleanup` job deletes `pending` uploads older than 24 hours with their
  objects. `createAvatarUploadAction` is rate limited per user so pending rows stay bounded.
- Client: `lib/client/uploads.ts` (`uploadFile`) is the one facade that talks to a non-app URL.
  `AvatarUploader` on `/settings` runs ticket action → `uploadFile` → attach action.
- Avatars render through `UserAvatar` (shadcn `Avatar`) with a plain `<img>`, so no `next/image`
  `remotePatterns` are needed.

## Infrastructure (`lib/server`)

- Server-only code that is not the database: `env.ts`, `redis.ts`, `cache.ts`, `queue.ts`,
  `mailer.ts`, `storage.ts`. Every file starts with `import 'server-only'`.
- **Only `lib/data` (including the Better Auth config), `jobs/`, `worker/` and tests import
  `@/lib/server/*`.** ESLint forbids it from `app/`, `actions/`, `components/`, `hooks/`, `presenters/`, `lib/client` and
  `lib/dto`. A page or action that needs infrastructure asks the DAL.
- Singletons (Redis, pg-boss, S3) hang off `globalThis` and are created lazily, so importing a file
  never needs its environment variables.
- `docker-compose.yml` provides Postgres, Redis and MinIO for development. Docker images for the web
  and worker processes are a planned follow-up; today both run on Node with `bun run start` and
  `bun run worker`.

## Hooks

- Located in `hooks/`. Named `useXxx` and exported as named functions.
- Return objects with state and stable callbacks.
- Only write a hook for independent logic or logic shared across components (e.g. `useScrollLock`). Never extract a hook for logic that is married to one component and gains
  nothing from the abstraction.

## Helpers & Presenters

- **Helpers** (`lib/`): exported named functions, no classes, no default exports. Pure
  formatting, parsing, and data utilities.
- **Presenters** (`presenters/`): plain functions, only for overrides. A presenter spreads the DTO
  and overrides or adds just the fields a view needs reshaped:
  `export const presentUser = (user) => ({ ...user, website: toAbsoluteUrl(user.website) })`.
  No classes, no presenter that only passes data through — if the DTO already fits the view, use it
  directly.
- Apply a presenter where the data is consumed (a view's `useMemo`). DTOs are plain
  objects, so they cross the Server → Client Component boundary safely; present on the client side
  of it.
- Reuse existing helpers and presenters before adding duplicate logic.

## Formatting (Prettier)

- Single quotes, no semicolons, trailing commas
- 2-space indentation (spaces, not tabs)
- 100-character print width

## Naming Conventions

| Element                      | Convention                 | Example                               |
| ---------------------------- | -------------------------- | ------------------------------------- |
| Variables / functions        | camelCase                  | `buildPostAttributes`, `presentUser`  |
| Components / classes / types | PascalCase                 | `PostForm`, `PostDetail`, `DataError` |
| Component directories        | PascalCase                 | `components/Posts/Form/`              |
| Route segments               | lowercase / kebab-case     | `app/(site)/ui-kit/`                  |
| Hooks                        | `useXxx`                   | `useScrollLock`                       |
| Presenters                   | `presentXxx`               | `presentUser`                         |
| Test files                   | `*.test.ts` / `*.test.tsx` | `posts.test.ts`                       |
| Server Actions               | `xxxAction` in `actions/`  | `createPostAction`                    |

## Testing

- Framework: Vitest. Tests live in `tests/` mirroring the source structure.
- Use `describe` / `it` blocks (not `test`).
- Import from vitest: `import { describe, expect, it } from 'vitest'`.
- Use `@/` path aliases for imports in test files.
- Server tests start with `// @vitest-environment node`, mock `next/headers` with the cookie jar in
  `tests/helpers/cookies.ts` and mock `next/cache`, create users with `createUser()` /
  `signInAs()` from `tests/helpers/server.ts`, and run against `next_template_test` only. Run
  `bun run db:test:prepare` after schema changes.
- `vitest.config.mts` inlines `better-auth` so its internal `next/headers` import goes through the
  mock.
- Server tests also need Redis (database 15 via `.env.test`); `resetDatabase()` flushes it. Tests that
  reach storage or Resend mock them, and `@/lib/server/queue` is mocked globally in `tests/setup.ts`. Tests
  never need MinIO or Resend.

## Test Pages

- Put manual UI test pages under `app/test/` (git-ignored).
- Prefer a narrow page that exercises existing app flows or Server Actions instead of duplicating
  component state locally.
- Name the route after the surface under test using kebab-case.
- Keep test pages internal-facing: simple controls, minimal copy, and enough state visibility to
  support manual QA without turning them into product UI.
- It should allow the tester to explore the component thoroughly.
- Reusable component examples belong in the `/ui-kit` catalog instead; keep it in sync when a
  reusable component changes.

## Forms

- React Hook Form + Zod via `zodResolver`. Schemas come from `lib/dto` and are the same ones the
  Server Actions validate with.
- The form component owns `useForm` and hands validated values to the page through `onSubmit`. The
  page passes an `onSubmit` that calls a Server Action and returns its `ActionResult`; the form maps
  failures with `applyActionErrors` (field errors onto fields, otherwise `message` as a form-level
  alert).
- Hydrate/build helpers (`hydrateXForm`, `buildXAttributes`) live in a `utils.ts` beside the form.
- Keep field markup explicit — no field-definition arrays, no generic FormField wrapper.

## Layouts

| Route group | Use case                                               |
| ----------- | ------------------------------------------------------ |
| `(site)`    | Main pages (NavBar, content container, footer)         |
| `(minimal)` | Auth pages (`/login`, `/signup`; no navigation chrome) |

- The root `app/layout.tsx` owns fonts, global styles, and `Providers` (theme, tooltips, toaster).
- The `(site)` layout reads the session (`getViewer()`) in async slots (`NavBarSlot`,
  `VerifyEmailBannerSlot`), each inside its own `<Suspense>`, so the shell prerenders and the
  viewer-dependent parts stream in.

## Environment & Config

- Public config comes from `NEXT_PUBLIC_*` variables read once in `lib/env.ts` — do not hardcode
  URLs or app names.
- `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` live in `.env` (dev) and `.env.test`
  (tests). Both are untracked; update the `*.example` files when adding a variable.
- Server-only config (`REDIS_URL`, `RESEND_API_KEY` (optional), `EMAIL_FROM`, `S3_ENDPOINT`,
  `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`) is read
  through `serverEnv()` in `lib/server/env.ts`: Zod-validated, parsed on first use (so `next build`
  works without it), one error listing every bad variable. Never read these from `process.env`
  elsewhere.
- `.env.test` points `REDIS_URL` at **database 15**; the test helpers flush it and refuse to run
  against any other database. The web process and the worker need the same `BETTER_AUTH_URL`
  (email links are built from it).

## Verifying Changes

Do not run `bun run build` for every change — it is slow and unnecessary for most issues. Instead
run:

```bash
bun run typecheck   # type errors, broken imports, bad props
bun run lint        # syntax errors, unused vars, bad patterns
bun run test        # behavior
```

Run `bun run build` when you touch `next.config.ts`, `proxy.ts`, route segment config, dynamic
rendering, or the Server/Client Component boundary — those failures only surface at build time.

## Working Principles

- **Keep changes focused and minimal.** Do not refactor unrelated areas while solving a targeted
  task.
- **Match surrounding style.** Follow the import style, naming, and formatting of the file you are
  editing.
- **Prefer the existing primitives** in `components/SCN` (add more with `bunx shadcn@latest add`)
  before introducing new UI libraries.
- **Read installed sources instead of guessing.** Next.js docs are in `node_modules/next/dist/docs/`;
  shadcn components are vendored in `components/SCN`; Prisma guidance is in its synced skills.
- **Keep data access in the DAL (`lib/data`)**, not in components, pages, actions, or Route Handlers.
- **Auth checks live in the DAL**, never only in a page, action, or proxy.
- **Do not introduce patterns the codebase doesn't use.** Specifically: no class-based presenters,
  no hand-written types that duplicate a DTO schema, no `fetch` in components, no Server Components
  calling the app's own Route Handlers.
- **Temporary debug pages must live under `app/test/*`.** This path is git-ignored.
- **Commit messages** use conventional prefixes: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`,
  `test:`.
- **Avoid hacky ways of achieving tasks.** Do not hack your way into a solution. Think about
  whether it would pass a senior engineer reviewing your PR.
- **Record decisions.** Framework and library choices go in `docs/DECISIONS.md` with the reason.
