# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

# AGENTS.md — Next Template

## The One-Contract Rule

Every data path ends at the same DAL function and returns the same DTO under the same auth rules:
Server Component, Server Action (`actions/`) and Route Handler (`app/api/v1`) all call `lib/data`.
DTOs are Zod schemas in `lib/dto` (`z.infer` gives the types). The DAL is the only code that touches
Prisma. It enforces auth itself (`requireUser()` / `requireAdmin()` plus the record-level rules in
`lib/data/policies`) and validates its own inputs (`parseInput`), so a caller that forgets a check
cannot bypass it.

## Locating Code

- Tests under `tests/` mirror the source tree: `tests/components/Posts/PostForm.test.tsx` ↔
  `components/Posts/Form/`. When a test fails, read it first, then the source at the mirrored path.
- Search with `rg`/`grep` inside this repo only. The exceptions are `node_modules/next/dist/docs/`
  and `node_modules/@prisma/` for the installed libraries' documentation.

## Documentation

The code, its comments and its tests are the documentation. A rule the code cannot show goes in a
comment beside the code or in this file, never in a new guide. The only prose:

- `docs/guides/getting-started.md`: services, Docker, the rename checklist, removing the posts
  example, a test database per checkout.
- `docs/guides/uploads.md`: setting up the R2 bucket.
- `docs/recipes/concurrency.md`: money, row locks, conditional writes and optimistic locking, which
  the template does **not** implement. Read it before adding such a feature; never treat it as a
  description of existing code.
- `docs/DECISIONS.md`: choices with their reasons. A new framework or library choice is recorded
  there.

## Commands

| Command                   | Purpose                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `bun run dev`             | Next dev server                                                                                        |
| `bun run dev:worker`      | Background worker (pg-boss jobs and cron) with restarts; `bun run worker` without                      |
| `bun run build`           | Production build                                                                                       |
| `bun run typecheck`       | Generate the Prisma client and route types, then `tsc`                                                 |
| `bun run lint`            | ESLint                                                                                                 |
| `bun run format:check`    | Prettier check (`bun run format` writes)                                                               |
| `bun run test <files>`    | Vitest on the named files; `-t "<name>"` filters by test name                                          |
| `bun run db:migrate`      | Create and apply a migration to the dev DB, then regenerate                                            |
| `bun run db:deploy`       | Apply pending migrations only (CI / production)                                                        |
| `bun run db:generate`     | Regenerate the Prisma client into `generated/`                                                         |
| `bun run db:seed`         | Seed the dev DB (3 users, 12 posts, password `password123`); refuses production without `ALLOW_SEED=1` |
| `bun run db:reset`        | Drop, re-migrate and re-seed the dev DB                                                                |
| `bun run db:test:prepare` | Reset the test DB, apply migrations, install the `pgboss` schema                                       |

- **Package manager:** bun (pinned in `packageManager`), never npm or yarn. Scripts run on Node.
- `postinstall` runs `prisma generate` into the git-ignored `generated/`. Prisma 7 does not generate
  or seed after `migrate dev` / `migrate reset`; the `db:*` scripts do it explicitly.

## Verifying Changes

Run `bun run typecheck`, `bun run lint` and `bun run test` on the test files the change touches.
Never run the whole suite: it truncates the shared test database and takes minutes. Run
`bun run build` only when you touch `next.config.ts`, `proxy.ts`, route segment config, dynamic
rendering or the Server/Client Component boundary, whose failures only surface at build time.

## Tech Stack

- **Framework:** Next.js 16 App Router, React 19, TypeScript (strict), React Compiler on
- **UI:** shadcn/ui on Base UI (`base-vega`), vendored as flat files in `components/ui/`
- **Data:** server-only DAL in `lib/data`, Zod DTOs in `lib/dto`, Server Actions for writes
- **Database:** Prisma ORM 7.10 (`prisma-client` generator, `@prisma/adapter-pg`) on PostgreSQL 18
- **Cache + rate limits:** Redis (`ioredis`) behind `lib/server`, the only cache: Next's Cache
  Components (`'use cache'`) are off
- **Jobs:** pg-boss on the same PostgreSQL, run by a separate worker process (`worker/`)
- **Storage:** Cloudflare R2 through `@aws-sdk/client-s3`, optional (the five `R2_*` variables turn
  the profile photo upload on)
- **Email:** Resend through the `send-email` job, plain templates in `emails/`
- **Logging:** pino (`lib/server/logger.ts`)
- **Auth:** Better Auth (email + password, Prisma adapter, `admin` plugin, `nextCookies`)
- **Forms:** React Hook Form + Zod 4
- **Styling:** SCSS CSS Modules beside components; shadcn tokens in `styles/global.css`; Tailwind
  only in `components/ui`
- **Testing:** Vitest + Testing Library (jsdom; server tests in node against a real test DB)

## Project Structure

```
app/                     # route groups (site), (minimal), (admin); api/auth, api/v1, api/health
  (site)/<route>/        # page.tsx (Server Component) + optional view.tsx ('use client') + styles.module.scss
actions/                 # 'use server' Server Actions
components/              # <Area>/<Name>/index.tsx + styles.module.scss
components/ui/          # shadcn/ui primitives (the only place Tailwind is allowed)
hooks/                   # Reusable hooks (useXxx)
presenters/              # Overrides for views that need reshaped data
types/                   # Cross-cutting types (types/api.ts: ActionResult, ErrorBody, FieldErrors)
lib/                     # Pure helpers: env, constants-*, formErrors, keyboard, csp, seo, structuredData, openapi
lib/dto/                 # Zod schemas + inferred types; client- and server-safe
lib/client/              # Browser-side helpers (uploadFile, RequestError)
lib/data/                # Server-only DAL; maintenance.ts is the system DAL (jobs only)
lib/server/              # Server-only infrastructure: env, redis, cache, queue, mailer, storage, logger
jobs/                    # Job definitions and handlers
worker/                  # Worker entry, its tsconfig, the test-DB pg-boss migrate script
emails/                  # Email templates ({ subject, html, text })
prisma/                  # schema.prisma, migrations, seed
generated/               # Prisma client (git-ignored)
proxy.ts                 # Optimistic auth redirects and the per-request CSP nonce
tests/                   # Vitest, mirroring the source tree
```

## TypeScript

- Strict mode. Prefer `type` over `interface` (unless extension or declaration merging is needed).
  `| null` for nullable fields, matching the database. No `any` where a type or guard is practical.
- **Zod schemas in `lib/dto` are the source of truth for types.** Inputs (`createPostInput`) and
  outputs (`postSummarySchema`, `postDetailSchema`) are both schemas. Output schemas use
  `z.coerce.date()` so a client that parses JSON gets `Date` back.
- DTOs are per operation (`PostSummary` for lists, `PostDetail` for one record), shaped by the DAL's
  Prisma `select`; the DAL maps rows to DTOs, so drift from the database fails to compile there.
- **No Prisma types outside `lib/data`** (and `prisma/`); ESLint enforces it.
- Lists are `Page<T> = { items, page, perPage, totalItems, totalPages }` (`lib/dto/common.ts`).
- Import with the `@/` alias.

## React Components

- **Every function is a `const` arrow function**, components, hooks, helpers, DAL functions and
  actions alike (ESLint `func-style`). Only the generated `components/ui` has `function`
  declarations.
- Components use **named exports**. Route files (`page.tsx`, `layout.tsx`, `not-found.tsx`,
  `route.ts`) use the default export Next requires: `const PostsPage = async (…) => { … }` then
  `export default PostsPage`.
- **Server Components by default.** `page.tsx` is an async Server Component that owns `metadata`,
  awaits `params` / `searchParams` (Promises), calls the DAL through `loadPage` and renders the markup.
- **Push `'use client'` to the leaves.** Add a sibling `view.tsx` only for the interactive part
  (handlers that call actions, toasts, navigation, URL state); `/posts/[id]` has none, only its
  `DeletePostButton` is a client component. When a view wraps content that needs no interactivity,
  the page passes it as `children` so it stays server-rendered (`/posts`).
- **SEO lives in the page's metadata.** A public page sets a `description` and a relative
  `alternates.canonical`; a record page also sets `openGraph` (spreading `SITE_OPEN_GRAPH`) and
  renders `<JsonLd>` from `lib/structuredData`. A private, transient or near-duplicate view (draft,
  search, filtered list, auth pages, settings) sets `robots: NO_INDEX` instead of a canonical. A new
  indexable route goes into `app/sitemap.ts`.
- **No `<Suspense>` is needed around data reads**: a page awaits its data, so `redirect()` and
  `notFound()` answer with real 307 / 404 statuses. Wrap a slow section in
  `<Suspense fallback={<PageLoading />}>` only to stream it. The one required boundary: a client
  component that calls `useSearchParams` (`useUrlState`) on a page that reads nothing on the server.
- Do not cast with `as` inside JSX; narrow or derive the value in the component body.

## Hooks & Forms

- Hooks live in `hooks/` as `useXxx` returning an object of state and callbacks, only for logic that
  is independent or shared (`useScrollLock`, `useUrlState`, `useReturnPath`).
- **No `useMemo` / `useCallback` / `React.memo`**: the React Compiler memoizes (in Vitest too).
  Never rely on memoization for correctness. An effect that needs the latest props or state without
  re-running reads them through `useEffectEvent` (`NavBar`'s resize handler).
- **A file that uses React Hook Form starts `'use client'` then `'use no memo'`** (copy
  `components/Posts/Form`): compiled, the cached `register()` stops following resets and new
  `values`. ESLint fails the file without the directive.
- Forms are RHF + `zodResolver` with the same `lib/dto` schema the DAL validates with. The form owns
  `useForm` and hands validated values to `onSubmit`; the view's `onSubmit` calls a Server Action and
  returns its `ActionResult`; the form maps failures with `applyActionErrors`. `hydrateXForm` /
  `buildXAttributes` live in a `utils.ts` beside the form. Field markup stays explicit: no
  field-definition arrays, no generic FormField. A non-native control (`Checkbox`) goes through
  RHF's `Controller`.
- ⌘/Ctrl + Enter submits: `onKeyDown={submitOnShortcut}` on the `<form>`,
  `aria-keyshortcuts={SUBMIT_KEYSHORTCUTS}` on the submit button and a `ShortcutHint` beside it.
- **URL state:** `useUrlState(schema, { history })` keeps list filters in the query string. Every
  field of the schema has `.default()` or `.catch()`, so any URL parses; the page reads the same
  schema (`postsUrlQuery`) from `searchParams` through `toScalarParams`. A filter change resets
  `page` in the same patch.
- The NavBar's log in link calls `useReturnPath().remember`, so login and signup return the visitor
  to the page they left; an explicit `next` wins.

## Styling

- `styles/global.css` is the single theme source: stock shadcn neutral tokens and the Tailwind base
  layer. No secondary palette or token aliases.
- Outside `components/ui`: semantic class names in CSS Modules using shadcn tokens directly
  (`var(--foreground)`, `var(--border)`, …). No Tailwind utilities, `@apply` or inline `style`
  unless the value is runtime-only (emails in `emails/` are the exception).
- `components/ui` holds CLI-generated primitives, unchanged apart from Prettier. Update them with
  `bunx shadcn@latest add <names> --overwrite --yes`, never local rewrites. Behaviour such as labels,
  errors and loading lives in application wrappers (`components/Form/Input`, `Textarea`,
  `LoadingButton`).
- Callers do not pass `className` / `style` to reusable components; variants live in wrappers.
- Compose with Base UI's `render` prop, not Radix's `asChild`:
  `<DialogTrigger render={<Button variant="outline" />}>Open</DialogTrigger>`. A link styled as a
  button is `ButtonLink`, never `<Button render={<Link />}>` (Base UI's Button sets `role="button"`
  and hides the link from assistive tech). A `Select` gets an `items` map so its trigger shows the
  label; its `onValueChange` receives `value | null`.
- Icons: `data-icon="inline-start"` (or `inline-end`) beside a label; `size="icon-*"` plus
  `aria-label` for an icon-only button, which also gets a tooltip (`ActionButton`, `ActionLink`)
  unless the glyph is universal (a magnifier). Dialog footers and sentence-length links keep their
  words. `LoadingButton` takes an `icon` that its spinner replaces.
- A record's view, edit and delete are `ActionLink` / `ActionButton` (from `RECORD_ACTIONS`), in
  that order, in an `ActionGroup` at the end of the row or header; `ConfirmDialog` takes
  `triggerAction="delete"`.
- Accessibility: one `main` and one `h1` per page (`AuthHeader` on auth pages); links in running
  text are underlined; every `role="search"` landmark has its own `aria-label`; the `(site)` layout
  starts with a skip link.
- Theme: `next-themes` with `attribute="class"`, system default. While `PINNED_THEME`
  (`lib/constants-theme.ts`) is set, the site is forced to that theme and the toggle is hidden.

## Data Access Layer

- `lib/data/**` is the only code that imports `@/generated/prisma/*` or `@prisma/*`. Every file
  starts with `import 'server-only'`.
- Select exactly the columns a DTO needs (`satisfies Prisma.PostSelect`), map the row to the DTO and
  return the DTO, never a Prisma row.
- **Every function validates its own inputs** with `parseInput(schema, input)` and works on the
  parsed result (trimmed, defaulted). The parameter stays typed with the DTO type for callers.
  Order: signed in (401) → input valid (422) → exists (404) → allowed (403).
- Ids are UUIDv7 (generated by Prisma Client). A malformed id must never reach Prisma (PostgreSQL
  throws): validate with `idSchema` / `z.uuid()`. A read by id treats a malformed id as not found
  (`getPost('abc')` throws `NotFoundError`), so pages pass the route param straight in; a write
  reports it as a validation error.
- Every function enforces auth itself: `requireUser()` / `requireAdmin()` plus record-level rules.
  `createPost` and `createUpload` call `consumeRateLimit` right after `requireUser()`, so every path
  shares the limit.
- Record-level rules live in `lib/data/policies/<resource>.ts`, pure and tested per viewer in
  `tests/lib/data/policies/`. The DAL calls `authorize(rule, viewer, record)` (throws
  `ForbiddenError`) and builds a DTO's `permissions` with `permissionsFor(policy, actions, viewer,
record)`. No inline `viewer.id === authorId` checks.
- A constraint race the DAL can foresee (a username taken between check and write) becomes a field
  error through `isUniqueViolation` / `isForeignKeyViolation` (`lib/data/prismaErrors.ts`), never a 500.
- Durations use `lib/constants-time.ts` (`SECOND` … `DAY`, in seconds; `MINUTE * 1000` for
  milliseconds), not literal numbers.
- **Raw SQL** (`db.$queryRaw`) only for what Prisma cannot express, tagged template only (never
  string-built SQL, never `$queryRawUnsafe`), rows parsed with Zod before they leave the DAL. The
  client's session runs in UTC (`options: '-c timezone=UTC'` in `lib/data/db.ts` and the seed)
  because the adapter treats `timestamptz` as wall-clock time; keep that in any new client.
- Server Components call the DAL directly (through `loadPage` for the redirect / not-found
  behaviour), never the app's own Route Handlers. `loadPage` awaits `connection()`, so a page is
  never prerendered by `next build`.
- Deliberate exceptions to "every function enforces auth": `lib/data/health.ts` (a public probe,
  ok/fail only) and `lib/data/maintenance.ts` (the system DAL, importable from `jobs/**` only,
  lint-enforced).
- `lib/data/admin.ts` wraps Better Auth's admin plugin behind `requireAdmin()` and this app's rules;
  the plugin's HTTP routes are closed in `lib/data/auth.ts`.
- The seed runs on plain Node outside Next, so it owns its own client instead of importing `lib/data`.

## Server Actions

- Writes go through `'use server'` files in `actions/`. Anything can reach an action endpoint, so an
  action passes its arguments to the DAL untouched (never destructure or read a field first).
- Shape: DAL call, then `revalidatePath` / `refresh`, then `{ ok: true, data }`, all inside `try`;
  `catch (error) { return toActionFailure(error) }`. Return `ActionResult<T>`; never throw for
  expected failures.
- Auth actions in `actions/auth.ts` call `auth.api.*` with no DAL function behind them, so they run
  `parseInput` themselves.
- The calling view owns navigation and toasts; the form owns field errors.

## Route Handlers

- `app/api/v1/<resource>` exists only for an HTTP API or a client component that must fetch.
- A handler is thin: `consumePublicApiLimit('<endpoint>')` first for a public read, `requireUser()`
  first for a write; a JSON body only (refuse any other `Content-Type`: with the `SameSite=Lax`
  cookie that is the CSRF guard); decode with the DTO schema, call the DAL, return JSON or
  `toErrorResponse(error)`. 201 for a create, 200 for reads and updates, 204 for a delete.
- Type the context with `RouteContext<'/api/v1/posts/[id]'>`, await `params` and hand the raw id to
  the DAL. A new public handler also gets a path in `lib/openapi.ts`.
- A client component that fetches goes through a small facade that parses the response with the
  shared `lib/dto` schema, never an inline `fetch` (none exists today).
- The other handlers: `GET /api/health` (database and Redis, ok/fail only) and
  `app/api/auth/[...all]` (Better Auth).

## Errors

- The DAL throws `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ValidationError` and
  `RateLimitedError` (`DataError`s with a `code`). Anything else is a bug and propagates.
- Each caller translates once: Server Action → `toActionFailure` (Next redirect / not-found errors
  are rethrown); Route Handler → `toErrorResponse` (401 / 403 / 404 / 422 / 429); page → `loadPage`
  (redirect to login, or `notFound()` for missing or forbidden).
- Forms map failures with `applyActionErrors`: field errors on their fields, the rest on
  `root.server`.

## Caching

- One cache: Redis through `remember()` (`lib/server/cache.ts`), inside the DAL, for data that is
  the same for every viewer. Check auth first, `remember()` only the viewer-independent part, compute
  viewer-specific fields after. Never cache viewer-dependent data under a shared key; searches,
  author lists and lists that include drafts are never cached.
- Invalidate inside the DAL right after the write succeeds (actions still call `revalidatePath` /
  `refresh` for the router cache). Tags live in `lib/data/cacheTags.ts`.
- Keys are built from unambiguous parts (`JSON.stringify([...])`, never a join of user strings), and
  every input that reaches a key is bounded in its DTO.
- Do not turn on `cacheComponents`: a second cache is a copy Redis invalidation cannot reach.
- Redis is an optimization, not a dependency: errors are logged and the request falls through to
  the database; a `load()` that throws is never cached. Redis must be 7+ (`PEXPIRE ... NX`) with
  `maxmemory-policy volatile-lru`, because tag versions have no TTL and must never be evicted.

## Auth

- Only `lib/data/auth.ts`, `lib/data/admin.ts`, `actions/auth.ts`, `app/api/auth/[...all]`,
  `proxy.ts` and `prisma/seed.ts` import `better-auth`. Everything else asks the DAL:
  `getSessionUser()`, `requireUser()`, `requireAdmin()`, `getViewer()`.
- Better Auth's `disabledPaths` closes every route whose rules live in an action or the DAL. Remove
  an entry only together with code that enforces the same rules. What stays open is what an email
  link or OAuth needs, plus session reads and sign-out.
- `proxy.ts` is optimistic: it checks that the session cookie exists and treats unknown paths as
  private. It has no guest-only redirect (a stale cookie must not lock anyone out of `/login`); the
  `/login` and `/signup` pages redirect signed-in viewers themselves.
- Spammable auth and account actions are rate limited in production with `consumeRateLimit`
  (Redis, fail-open). Per-IP limits read `x-forwarded-for` through `getClientIp`, which assumes
  `TRUSTED_PROXY_HOPS` proxies (default 1) appended the client address.
- Sessions refresh only through Server Actions or the auth route (Server Components cannot set
  cookies); client code never reads or sends a token.
- Google sign-in exists only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both set. Its
  callback `/api/auth/callback/google` must stay out of `disabledPaths`.

## Configuration & Infrastructure

- Public config is `NEXT_PUBLIC_*`, read once in `lib/env.ts`; never hard-code a URL or the app name.
- Server config goes through `serverEnv()` (`lib/server/env.ts`): Zod-validated on first use (so
  `next build` works without it), an empty optional variable counts as unset, validated at boot in
  production by `instrumentation.ts` and the worker. Never read `process.env` elsewhere, except
  `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` and the Google pair (the auth config is built at import)
  and `LOG_LEVEL`. A new variable also goes into `.env.example` and `.env.test.example`.
- Security headers live in `next.config.ts` (`SECURITY_HEADERS`), the CSP in `proxy.ts`
  (`lib/csp.ts`); changing either calls for `bun run build`.
- `lib/server/*` is imported only by `lib/data`, `jobs/`, `worker/` and tests (ESLint). Singletons
  (Prisma, Redis, pg-boss, R2) hang off `globalThis` and are created lazily, so importing a file never
  needs its environment variables.
- Logging: a child logger per module (`logger.child({ module: 'cache' })`), fields first, message
  second: `log.error({ err: error }, 'read failed')`. Never log a payload or a message body (job
  payloads carry live links).
  `console` is forbidden in `lib/data`, `lib/server`, `jobs` and the worker.

## Jobs & Email

- pg-boss runs only in the worker (`worker/index.ts`); without it nothing queued runs.
  `jobs/definitions.ts` has one entry per job (name, Zod payload, options, optional cron). A handler
  is `handleXxx(payload: unknown)`: it re-parses the payload and lets errors propagate so pg-boss
  retries. A new job: definition → handler → register in `worker/index.ts` → tests in `tests/jobs/`.
- Enqueue from the DAL or a Better Auth callback, never a component; after a transaction commits;
  and without awaiting where response time could reveal whether an account exists.
- Job-only functions with no viewer go in `lib/data/maintenance.ts`; anything a user can trigger goes
  in a normal DAL file with auth.
- Nothing sends mail inside a request: callbacks enqueue `send-email` and the worker renders and
  sends. Templates in `emails/` return `{ subject, html, text }` through `buildEmail`, escape every
  interpolated value with `escapeHtml`, and put the action link on its own line of the text. A new
  email is a file in `emails/`, a member of `sendEmailPayload`, a case in `renderEmail`, and tests in
  `tests/emails/` and `tests/jobs/`. Without `RESEND_API_KEY` the mailer logs the mail outside
  production and throws in production.

## Adding a Resource

Copy the posts example, in this order:

1. **Schema** in `prisma/schema.prisma`: UUIDv7 id, camelCase fields with snake_case `@map`s, an
   index on every foreign key you filter by, `onDelete: Cascade` where the child cannot outlive its
   parent. `bun run db:migrate`, then `bun run db:test:prepare`. A table that does not hang off
   `users` goes into `resetDatabase()`'s TRUNCATE list (`tests/helpers/server.ts`).
2. **DTOs** in `lib/dto/<name>.ts`: an input schema per write, an output schema per read shape, list
   queries with every field bounded, and an `xxxUrlQuery` twin with `.catch()` on every field if the
   list keeps its filters in the URL.
3. **DAL** in `lib/data/<name>.ts` and its policy in `lib/data/policies/<name>.ts`, tested first per
   viewer (signed out, owner, other user, admin) in `tests/lib/data/<name>.test.ts`.
4. **Server Actions** in `actions/<name>.ts`; a Route Handler only for an HTTP API or a client fetch.
5. **Pages and forms**: `page.tsx` loads through `loadPage`, `view.tsx` only for the interactive
   part, styles in an SCSS module.
6. **Routes**: constants in `lib/constants-routes.ts` (public ones in `PUBLIC_ROUTES`), the NavBar
   link, `app/sitemap.ts` when indexable, page metadata.
7. Extend `prisma/seed.ts` and add tests under the mirrored paths. Tests that expect a record to be
   public set that flag explicitly (a post defaults to a draft).

## Helpers & Presenters

- **Helpers** (`lib/`): named `const` arrow functions, no classes, no default exports.
- **Presenters** (`presenters/`) exist only for overrides: spread the DTO and override just the
  fields a view needs reshaped:
  `export const presentUser = (user) => ({ ...user, website: toAbsoluteUrl(user.website) })`.
  No presenter that only passes data through.
- Present on the side that renders: DTOs are plain objects and cross the Server → Client boundary; a
  presented value holding a function or class instance would not.

## Naming

| Element                      | Convention                 | Example                              |
| ---------------------------- | -------------------------- | ------------------------------------ |
| Variables / functions        | camelCase                  | `buildPostAttributes`, `presentUser` |
| Components / classes / types | PascalCase                 | `PostForm`, `PostDetail`             |
| Component directories        | PascalCase                 | `components/Posts/Form/`             |
| Route segments               | lowercase / kebab-case     | `app/(site)/ui-kit/`                 |
| Test files                   | `*.test.ts` / `*.test.tsx` | `posts.test.ts`                      |
| Server Actions               | `xxxAction` in `actions/`  | `createPostAction`                   |

Prettier owns formatting: single quotes, no semicolons, trailing commas, 2 spaces, 100 columns.

## Testing

- Vitest, `describe` / `it` (not `test`), imports from `vitest` and `@/` paths.
- Server tests start with `// @vitest-environment node`, mock `next/headers` with the cookie jar in
  `tests/helpers/cookies.ts` and mock `next/cache`, create users with `createUser()` / `signInAs()`
  (`tests/helpers/server.ts`), and run against `next_template_test` and Redis database 15, which
  `resetDatabase()` truncates and flushes. Run `bun run db:test:prepare` after schema changes.
- `vitest.config.mts` inlines `better-auth` so its `next/headers` import hits the mock, and runs the
  React Compiler so tests exercise the code that ships.
- The job queue is mocked in `tests/setup.ts`; `tests/helpers/mail.ts` turns queued `send-email`
  payloads back into mails and reads their links. Tests never send mail or reach Google.
- Each checkout or worktree needs its own test database (see `getting-started.md`).

## Test Pages

Manual QA pages go under `app/test/<kebab-case-surface>/` (git-ignored): narrow, internal-facing
pages that drive the real component or Server Action and show enough state to explore it. Reusable
component examples belong in the `/ui-kit` catalog instead; keep it in sync when a reusable component
changes.

## Layouts

| Route group | Use                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `(site)`    | Main pages (NavBar, content container, footer)                                                                                        |
| `(minimal)` | Auth pages (`/login`, `/signup`), no navigation chrome                                                                                |
| `(admin)`   | `/admin/**`: sidebar shell (`components/Admin/Shell`); its layout runs `requireAdmin()` and every page reads admin-only DAL functions |

- The root `app/layout.tsx` owns fonts, global styles and `Providers` (theme, tooltips, toaster).
- The `(site)` layout reads the session once (`getViewer()`, `getSessionUser()`) and passes the
  viewer to `NavBar`, `VerifyEmailBanner` and `ImpersonationBanner`, so every `(site)` route renders
  per request.

## Working Principles

- Keep changes focused; do not refactor unrelated areas. Match the style of the file you edit.
- Prefer the existing `components/ui` primitives (add more with `bunx shadcn@latest add`) before a
  new UI library.
- Do not introduce patterns the codebase doesn't use: no class-based presenters, no hand-written
  types that duplicate a DTO schema, no `fetch` in components, no Server Components calling the
  app's own Route Handlers.
- No hacks: the change should pass a senior engineer's review.
- Commit messages use conventional prefixes: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
