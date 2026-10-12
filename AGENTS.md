# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

# AGENTS.md — Next Template

## The One-Contract Rule

Every data path ends at the same DAL function and returns the same DTO type under the same auth rules:
Server Component → `lib/data`; Server Action (`actions/`) → `lib/data`; Route Handler (`app/api/v1`) →
`lib/data`. DTOs are Zod schemas in `lib/dto` (`z.infer` gives the types). The DAL is the only code that
touches Prisma. It enforces auth itself (`requireUser()` / `requireAdmin()` plus record-level rules in
`lib/data/policies`) and validates its own inputs with the `lib/dto` schema (`parseInput`), so a caller
that forgets a check cannot bypass it.

## Locating Code

- Tests under `tests/` mirror the source tree: `tests/components/Posts/PostForm.test.tsx` ↔
  `components/Posts/Form/`. When a test fails, read the test file first, then look for the source
  at the mirrored path before searching.
- Search with `rg`/`grep` scoped to this repo — never search outside the project directory.
  `node_modules/next/dist/docs/` and `node_modules/@prisma/` are the exceptions when you need the
  installed library's documentation.

## Guides

Long area narratives live in `docs/guides/`. Read the one for the area you touch before editing it.

- `docs/guides/architecture.md`: the layer diagram, DTOs, DAL, actions, Route Handlers (REST API table), errors, presenters, caching, jobs, auth, admin, the pattern index and the "Adding a resource" checklist.
- `docs/guides/getting-started.md`: the stack, setup, services, Docker, every script, testing.
- `docs/guides/authentication.md`: Better Auth, the admin plugin (roles, bans, impersonation), email flows, account settings, Google, rate limits.
- `docs/guides/posts.md`: the posts example (visibility, caching, search, the pages).
- `docs/guides/route-handlers.md`: Route Handlers, the REST API, health.
- `docs/guides/caching.md`: the Redis data cache (`remember`, tags, what is never cached).
- `docs/guides/jobs.md`: pg-boss jobs, handlers, the worker, the system DAL.
- `docs/guides/email.md`: the mailer, the `send-email` job and the plain templates in `emails/`.
- `docs/guides/uploads.md`: avatar uploads on Cloudflare R2 (presigned PUT, attach, delayed deletes, bucket setup).
- `docs/guides/infrastructure.md`: `lib/server`, logging, Docker and CI.
- `docs/guides/hooks.md`: hook rules (no `useMemo` / `useCallback`; RHF files opt out with `'use no memo'`), `useUrlState`.
- `docs/guides/forms.md`: React Hook Form + Zod forms (each starts `'use client'` then `'use no memo'`).
- `docs/guides/environment.md`: public and server-only config, security headers, `serverEnv()`.

`docs/recipes/` holds patterns the template does **not** implement (concurrency and optimistic locking
and the other removed features) written to fit this architecture. Read one before adding
such a feature; never treat it as a description of existing code.

## Build & Run Commands

| Command                                    | Purpose                                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `bun run dev`                              | Start the Next dev server                                                                                        |
| `bun run build`                            | Production build                                                                                                 |
| `bun run test`                             | Run all Vitest tests                                                                                             |
| `bun run test tests/lib/dto/posts.test.ts` | Run a single test file                                                                                           |
| `bun run test -t "formats validation"`     | Run tests matching a name pattern                                                                                |
| `bun run lint`                             | ESLint                                                                                                           |
| `bun run typecheck`                        | Generate the Prisma client and route types, then `tsc`                                                           |
| `bun run format:check`                     | Prettier check                                                                                                   |
| `bun run db:generate`                      | Regenerate the Prisma client into `generated/`                                                                   |
| `bun run db:migrate`                       | Create + apply a migration to the dev DB, then regenerate                                                        |
| `bun run db:deploy`                        | Apply pending migrations only (CI / production)                                                                  |
| `bun run db:seed`                          | Seed the dev DB (3 users, 12 posts; password `password123`); refuses `NODE_ENV=production` unless `ALLOW_SEED=1` |
| `bun run db:reset`                         | Drop, re-migrate, and re-seed the dev DB (destroys its data)                                                     |
| `bun run db:test:prepare`                  | Reset the test DB, apply migrations, install the `pgboss` schema                                                 |
| `bun run worker`                           | Start the background worker (pg-boss jobs and cron)                                                              |
| `bun run dev:worker`                       | The worker with `tsx watch`, restarting on file changes                                                          |

- **Package manager:** bun (pinned via `packageManager`). Do not use npm or yarn. Scripts run on
  Node, not the Bun runtime.
- `postinstall` runs `prisma generate` into the git-ignored `generated/` directory. Prisma 7 does
  not generate or seed automatically after `migrate dev` / `migrate reset`; the `db:*` scripts do
  it explicitly.

## Tech Stack

- **Framework:** Next.js 16 App Router / React 19 / TypeScript (strict mode), with the React
  Compiler on (`reactCompiler: true`)
- **UI primitives:** shadcn/ui on Base UI (`base-vega` style), vendored as flat files in
  `components/SCN/`
- **Data layer:** server-only DAL in `lib/data`; Zod DTOs in `lib/dto`; Server Actions for writes
- **Database:** Prisma ORM 7.10 (`prisma-client` generator, `@prisma/adapter-pg`) on PostgreSQL 18
- **Cache + rate limits:** Redis (`ioredis`) behind `lib/server`. It is the only cache: Next's
  Cache Components (`'use cache'`) are off
- **Jobs:** pg-boss on the same PostgreSQL, run by a separate worker process (`worker/`)
- **Storage:** Cloudflare R2 through `@aws-sdk/client-s3` (`lib/server/storage.ts`), optional: the
  five `R2_*` variables turn the profile photo upload on
- **Email:** Resend through the `send-email` job, plain HTML templates in `emails/`, logged to the
  logger without an API key
- **Logging:** pino (`lib/server/logger.ts`), pino-pretty in development
- **Auth:** Better Auth (email + password, official Prisma adapter, `admin` plugin, `nextCookies`)
- **Forms:** React Hook Form + Zod 4
- **Styling:** Stock shadcn neutral tokens and Tailwind base styles in `styles/global.css`.
  SCSS CSS Modules beside application components; Tailwind utilities stay in `components/SCN`.
- **Testing:** Vitest + Testing Library (jsdom; server tests run in node against a real test DB)
- **Linting:** ESLint (`eslint-config-next` + `eslint-config-prettier`) + Prettier

## Project Structure

```
app/                     # App Router: route groups (site), (minimal), (admin); api/auth, api/v1/posts, api/health
  (site)/<route>/        # page.tsx (Server Component) + optional view.tsx ('use client') + styles.module.scss
actions/                 # 'use server' Server Actions (auth, users, admin, posts)
components/              # React components (ComponentName/index.tsx + styles.module.scss)
components/SCN/          # shadcn/ui primitives (the only place Tailwind is allowed)
hooks/                   # Reusable React hooks (useXxx)
presenters/              # Override functions for views that need reshaped data
types/                   # Cross-cutting types (types/api.ts: ActionResult, ErrorBody, FieldErrors)
lib/                     # Pure helpers, constants, env, formErrors, username derivation, csp, and
                         # openapi (the generated spec of the public handlers)
lib/dto/                 # Zod schemas + inferred types (inputs and outputs); client- and server-safe
lib/client/              # Browser-side helpers: uploadFile (the one fetch to a non-app URL), RequestError
lib/data/                # Server-only DAL: db client, auth (Better Auth config), errors, users, admin,
                         # sessions, posts, uploads, policies, health, rateLimit, page loader;
                         # maintenance is the system DAL (jobs only)
lib/server/              # Server-only infrastructure that is not the database: env, redis, cache,
                         # queue, mailer, storage (R2), logger
jobs/                    # Job definitions (name + Zod payload + options) and handlers
worker/                  # Background worker entry (pg-boss), tsconfig, test-DB migrate script
emails/                  # Plain email templates ({ subject, html, text }), rendered by the send-email job
prisma/                  # schema.prisma, migrations, seed
generated/               # Generated Prisma client (git-ignored; `postinstall` regenerates it)
styles/                  # global.css: official shadcn theme tokens and Tailwind base styles
proxy.ts                 # Optimistic auth redirects and the per-request CSP nonce (lib/csp.ts)
tests/                   # Vitest tests mirroring the source structure
docs/DECISIONS.md        # Framework and library choices, with reasons; what was removed and why
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

- **Every function is a `const` arrow function** (`export const PostForm = (props) => { … }`),
  components, hooks, helpers, DAL functions and Server Actions alike; ESLint enforces it with
  `func-style`. The only `function` declarations are in the generated `components/SCN`.
- Components use **named exports**. Next route files (`page.tsx`, `layout.tsx`,
  `not-found.tsx`, `route.ts`) use the default exports Next requires, written as
  `const PostsPage = async (…) => { … }` followed by `export default PostsPage`.
- **Server Components by default.** Add `'use client'` only for state, effects, event handlers, or
  browser APIs. `page.tsx` is an async Server Component that owns `metadata`, awaits
  `params`/`searchParams` (Promises), calls the DAL through `loadPage` and renders the markup.
- **Push `'use client'` to the leaves.** A page with nothing interactive of its own has no
  `view.tsx` (`/posts/[id]` renders on the server; only `DeletePostButton` is a client component).
  Add a sibling `view.tsx` only for the interactive part: handlers that call Server Actions,
  toasts, navigation, URL state. When a view wraps content that needs no interactivity, the page
  passes that content as `children` so it stays server-rendered (`/posts`: the view owns search,
  sort and pagination, the page renders the list into it).
- **No `<Suspense>` is required around data reads.** A page awaits its data and the response is
  sent when it is ready, so `redirect()` and `notFound()` answer with real 307 / 404 statuses. Wrap
  a slow section in `<Suspense fallback={<PageLoading />}>` only when you want it to stream. The
  one required boundary: a client component that calls `useSearchParams` (`useUrlState`) on a page
  that reads nothing on the server.
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
  (Email templates in `emails/` are the exception: mail clients need inline styles.)
- `components/SCN` contains official CLI-generated primitives. Keep them unchanged apart from
  Prettier formatting, including long class strings and upstream inline styles. Update/reinstall
  with `bunx shadcn@latest add <names> --overwrite --yes`, not local rewrites.
- Application callers do not pass `className`/`style` to reusable components. Put composition and
  named variants in application wrappers, not generated primitives.
- Form controls in `components/Form/Input` and `components/Form/Textarea` own `label`, `required`,
  and `error`, forwarding native props and React 19 `ref` to the stock controls. `LoadingButton`
  composes stock Button and Spinner. These behaviors must stay outside `components/SCN`.
- Primitives compose with Base UI's `render` prop, not Radix's `asChild`:
  `<DialogTrigger render={<Button variant="outline" />}>Open</DialogTrigger>`. A link that looks
  like a button is `ButtonLink` (a `next/link` with `buttonVariants`), never
  `<Button render={<Link />} nativeButton={false}>`: Base UI's Button sets `role="button"`, which
  hides the link from assistive tech. A `Select` gets an `items` map so its trigger shows the
  label, and its `onValueChange` receives `value | null`.
- `Providers` uses `next-themes` with `attribute="class"`, system default, and transition suppression
  on theme changes. `ThemeToggle` offers light/dark/system; the stock Toaster follows the theme.

## Data Access Layer

- `lib/data/**` is the only code that imports `@/generated/prisma/*` or `@prisma/*`. Every file
  starts with `import 'server-only'`.
- Select exactly the columns a DTO needs (`satisfies Prisma.PostSelect`), map the row to the DTO,
  and return the DTO. Never return a Prisma row to a caller.
- **Every function validates its own inputs** with `parseInput(schema, input)` from `./errors`
  (it throws `ValidationError` with per-field messages) and works on the parsed result, which is
  where trimming and defaults are applied. The parameter stays typed with the DTO type for callers;
  the parse is what makes it true at runtime, whoever calls. Order: signed in (401) → input valid
  (422) → exists (404) → allowed (403). Ids are UUIDs (v7, generated by Prisma Client), and a
  malformed one must never reach Prisma (PostgreSQL throws on it): validate it with `idSchema` /
  `z.uuid()`. A read by id treats a malformed id as not found (`getPost('abc')` throws
  `NotFoundError`), so pages pass the route param straight in; a write that takes an id
  (`updatePost`, `setUserRole`) reports it as a validation error.
- Every function enforces auth itself: `requireUser()` / `requireAdmin()` plus record-level rules.
  `createPost` and `createUpload` also call `consumeRateLimit` right after `requireUser()`, so every
  path to them shares the limit.
- Record-level rules live in `lib/data/policies/<resource>.ts` (`postPolicy`), pure and tested per
  viewer in `tests/lib/data/policies/`; DAL functions call `authorize(rule, viewer, record)`
  (`lib/data/policy.ts`, throws `ForbiddenError`) and build a DTO's `permissions` with
  `permissionsFor(policy, actions, viewer, record)`. Do not write inline `viewer.id === authorId` checks.
- Failures are typed errors (see **Errors**), not return codes.
- A constraint race the DAL can foresee (a username taken between the check and the write) is
  turned into a field error with `isUniqueViolation` / `isForeignKeyViolation`
  (`lib/data/prismaErrors.ts`), never left as a 500.
- Durations are written with `lib/constants-time.ts` (`SECOND` … `DAY`, in seconds; `MINUTE * 1000`
  for a millisecond window), not as literal numbers.
- **Raw SQL** (`db.$queryRaw`) is for what Prisma cannot express. Use the tagged template only, so
  every value is a bound parameter; never build SQL from strings, and never `$queryRawUnsafe`.
  Parse the rows with a Zod schema before they leave the DAL. The Prisma client runs its session in
  UTC (`options: '-c timezone=UTC'` in `lib/data/db.ts`, and in the seed) because the adapter reads
  and writes `timestamptz` as wall-clock values in the session time zone; keep that when you add a
  client.
- Server Components call the DAL directly (wrapped in `loadPage` when they need the redirect /
  not-found behaviour). They never fetch the app's own Route Handlers. `loadPage` awaits
  `connection()` before it loads, so a page is never prerendered (and frozen) by `next build`,
  even when its read does not touch the session; a component that calls the DAL without
  `loadPage` (e.g. the layout's `getViewer()`) is session based and so is already request-time.
- `lib/data/health.ts` and `lib/data/maintenance.ts` are the two deliberate exceptions to "every
  function enforces auth": health is a public probe that returns only ok/fail per dependency, and
  maintenance is the system DAL for jobs (importable from `jobs/**` only, lint-enforced).
- `lib/data/admin.ts` wraps Better Auth's admin plugin (`auth.api.setRole`, `banUser`, …) behind
  `requireAdmin()` and this app's own rules; the plugin's HTTP routes are closed in `lib/data/auth.ts`.
- The seed (`prisma/seed.ts`) runs on plain Node outside Next, so it owns its own client rather than
  importing `lib/data`.

## Server Actions

- Writes go through `'use server'` files in `actions/`. Inputs are typed for callers, but anything
  can reach an action endpoint, so an action passes its arguments to the DAL untouched (never
  destructure or read a field first) and the DAL validates them.
- Shape: `try { DAL call → revalidatePath / refresh → { ok: true, data } }
catch (error) { return toActionFailure(error) }`. Return `ActionResult<T>`; never throw for
  expected failures.
- Auth actions (`signInAction`, `signUpAction`, `signOutAction`, …) call `auth.api.*` and
  `refresh()`. There is no DAL function behind those calls, so these actions are the exception that
  runs `parseInput` themselves (in `actions/auth.ts`).
- The calling view owns navigation and toasts; the form owns field errors.
- Route Handlers (`app/api/v1/<resource>`) exist only for an HTTP API or a client component that
  must fetch. A handler is thin: `consumePublicApiLimit('<endpoint>')` first for a public read,
  `requireUser()` first for a write, a JSON body only (refuse any other `Content-Type`; with the
  `SameSite=Lax` cookie that is the CSRF guard), decode with the DTO schema, call the DAL, return
  JSON or `toErrorResponse(error)`. 201 for a create, 200 for reads and updates, 204 for a delete.
  A new public handler also gets a path in `lib/openapi.ts`.

## Errors

- The DAL throws `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ValidationError` and
  `RateLimitedError`, all `DataError`s with a `code`. Anything else is a bug and propagates.
- Each caller translates once: Server Action → `toActionFailure` (`ActionResult` with `code`,
  `message`, optional `fieldErrors`; Next redirect/not-found errors are rethrown); Route Handler →
  `toErrorResponse` (401 / 403 / 404 / 422 / 429 with `ErrorBody`); page → `loadPage` (redirect to
  login, or `notFound()` for missing or forbidden).
- Forms map failures with `applyActionErrors` (`lib/formErrors.ts`): field errors land on their
  fields, anything else on `root.server`.

## Caching

One cache: the Redis data cache (`remember()` in `lib/server/cache.ts`), used inside the DAL for data
that is the same for every viewer. Next's Cache Components are off, so `'use cache'` is not
available. Check auth first, `remember()` only the viewer-independent part, then compute
viewer-specific fields after; invalidate inside the DAL right after the write succeeds. Searches and
author lists are never cached. Redis is an optimization, never a dependency. Full rules:
`docs/guides/caching.md`.

## Helpers & Presenters

- **Helpers** (`lib/`): exported named `const` arrow functions, no classes, no default exports. Pure
  formatting, parsing, and data utilities.
- **Presenters** (`presenters/`): plain functions, only for overrides. A presenter spreads the DTO
  and overrides or adds just the fields a view needs reshaped:
  `export const presentUser = (user) => ({ ...user, website: toAbsoluteUrl(user.website) })`.
  No classes, no presenter that only passes data through — if the DTO already fits the view, use it
  directly.
- Apply a presenter where the data is consumed: call it directly in a Server Component
  (`/posts/[id]`) or in a client view. DTOs are plain objects, so they cross the Server → Client
  Component boundary safely; a presented value that holds a function or class instance would not,
  so present on the side that renders it.
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
  `bun run db:test:prepare` after schema changes (it resets the test database; `resetDatabase()`
  truncates `posts` and the user tables, so new tables that hang off them are cleared too).
- `vitest.config.mts` inlines `better-auth` so its internal `next/headers` import goes through the
  mock. It also runs the React Compiler (`reactCompilerPreset`), so component and hook tests
  exercise the same memoized code that ships.
- Server tests also need Redis (database 15 via `.env.test`); `resetDatabase()` flushes it. The job
  queue (`@/lib/server/queue`) is mocked globally in `tests/setup.ts`; `tests/helpers/mail.ts` turns
  the queued `send-email` payloads back into mails and reads their links and tokens. Tests never send
  mail or reach Google.

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

## Layouts

| Route group | Use case                                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `(site)`    | Main pages (NavBar, content container, footer)                                                                                                                                                          |
| `(minimal)` | Auth pages (`/login`, `/signup`; no navigation chrome)                                                                                                                                                  |
| `(admin)`   | The admin dashboard (`/admin/**`): shadcn sidebar shell (`components/Admin/Shell`), no NavBar; its layout runs `requireAdmin()` through `loadPage`, and every page still reads admin-only DAL functions |

- The root `app/layout.tsx` owns fonts, global styles, and `Providers` (theme, tooltips, toaster).
- The `(site)` layout is async: it reads the session once (`getViewer()`, `getSessionUser()`) and
  passes the viewer to `NavBar`, `VerifyEmailBanner` and `ImpersonationBanner`. Every `(site)` route
  is therefore rendered per request.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
