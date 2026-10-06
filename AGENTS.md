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
only code that touches Prisma. It enforces auth itself (`requireUser()` / `requireAdmin()` plus inline
record-level rules) and validates its own inputs with the `lib/dto` schema (`parseInput`), so a caller that
forgets a check cannot bypass it.

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

- **Framework:** Next.js 16 App Router / React 19 / TypeScript (strict mode), with the React
  Compiler on (`reactCompiler: true`)
- **UI primitives:** shadcn/ui on Radix, vendored as flat files in `components/SCN/`
- **Data layer:** server-only DAL in `lib/data`; Zod DTOs in `lib/dto`; Server Actions for writes
- **HTTP (client reads only):** `fetch` inside a typed facade in `lib/client`, parsed with the shared schema
- **Database:** Prisma ORM 7.10 (`prisma-client` generator, `@prisma/adapter-pg`) on PostgreSQL 18
- **Cache + rate limits:** Redis (`ioredis`) behind `lib/server`. It is the only cache: Next's
  Cache Components (`'use cache'`) are off
- **Jobs:** pg-boss on the same PostgreSQL, run by a separate worker process (`worker/`)
- **Email:** Resend + React Email templates (`emails/`), logged to the logger without an API key
- **Logging:** pino (`lib/server/logger.ts`), pino-pretty in development
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
  (site)/<route>/        # page.tsx (Server Component) + optional view.tsx ('use client') + styles.module.scss
actions/                 # 'use server' Server Actions (posts.ts, comments.ts, auth.ts, uploads.ts)
components/              # React components (ComponentName/index.tsx + styles.module.scss)
components/SCN/          # shadcn/ui primitives (the only place Tailwind is allowed)
hooks/                   # Reusable React hooks (useXxx)
presenters/              # Override functions for views that need reshaped data
types/                   # Cross-cutting types (types/api.ts: ActionResult, ErrorBody, FieldErrors)
lib/                     # Pure helpers, constants, env, formErrors
lib/dto/                 # Zod schemas + inferred types (inputs and outputs); client- and server-safe
lib/data/                # Server-only DAL: db client, auth, errors, users, posts, comments, uploads, health,
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
  `view.tsx` (`/posts/[userId]/[id]` renders on the server; only `DeletePostButton` is a client
  component). Add a sibling `view.tsx` only for the interactive part: handlers that call Server
  Actions, toasts, navigation, URL state. When a view wraps content that needs no interactivity,
  the page passes that content as `children` so it stays server-rendered (`/posts/ssr`: the view
  owns filters and pagination, the page renders the list into it).
- **No `<Suspense>` is required around data reads.** A page awaits its data and the response is
  sent when it is ready, so `redirect()` and `notFound()` answer with real 307 / 404 statuses. Wrap
  a slow section in `<Suspense fallback={<PageLoading />}>` only when you want it to stream. The
  one required boundary: a client component that calls `useSearchParams` (`useUrlState`) on a page
  that reads nothing on the server (`/posts/csr`).
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
- **Account settings** (`/settings`, a stack of cards): `updateProfileAction` (`actions/users.ts`:
  name, username, website; a taken username is a field error from the DAL), and in
  `actions/auth.ts` `changePasswordAction` (`auth.api.changePassword` with `revokeOtherSessions`,
  so this browser stays signed in and every other session ends), `changeEmailAction`,
  `revokeSessionAction`, `revokeOtherSessionsAction` and `deleteAccountAction`. Each parses its
  input, requires a session, is rate limited per user and `refresh()`es.
  - **Change email:** `user.changeEmail` is enabled. A verified user gets a `confirm-email-change`
    email at the **current** address (`sendChangeEmailConfirmation`); following it makes Better Auth
    send the usual verification email to the **new** address (`sendVerificationEmail`), and opening
    that switches the address. An unverified user skips the first step. A taken address gets the
    same response and no email, so it cannot enumerate accounts; the action itself only rejects the
    user's own address.
  - **Delete account:** `user.deleteUser` is enabled. `beforeDelete` queues `delete-object` for each
    of the user's upload keys (the rows cascade, the objects would be orphaned); `afterDelete`
    invalidates `POSTS_TAG` and the user's tag. Posts, sessions, accounts and uploads cascade.
  - **Sessions:** `lib/data/sessions.ts` (`listSessions`, `revokeSession`, `revokeOtherSessions`)
    works on the plain `sessions` rows, so deleting a row ends that session. `SessionUser` carries
    `sessionId` to mark the current one. `SessionSummary` never contains the token.
  - **Profile edits** go through `updateProfile` in `lib/data/users.ts`, which invalidates the cached
    viewer and `POSTS_TAG` (cached post lists embed the author's name and username).
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
- `proxy.ts` is optimistic only: it checks cookie _presence_ (`getSessionCookie`) to redirect
  private pages to `/login?next=…`. It has no guest-only redirect, because a stale cookie must not
  lock anyone out of `/login`; the `/login` and `/signup` pages call `getViewer()` and redirect
  signed-in users themselves. The real check is always in the DAL.
- Better Auth's HTTP router has `disabledPaths: ['/sign-up/email', '/update-user', '/delete-user',
'/delete-user/callback']` (returns 404; the callback is inert while no deletion token is issued): sign-up goes only through `signUpAction` (validated with `signUpInput`, rate
  limited), profile edits only through `updateProfile` (the same username and name rules), and
  account deletion only through `deleteAccountAction`, because over HTTP a fresh session can delete
  without a password while the action always demands it. Direct `auth.api.*` calls from server code
  are unaffected. Remove an entry only together with the code that validates the same rules. Every
  other path stays enabled on purpose: the email links need `/verify-email` and
  `/reset-password/:token`, and `/change-password` and `/change-email` enforce the same rules as
  their actions.
- Auth and upload actions that an attacker could spam (`signInAction`, `signUpAction`,
  `requestPasswordResetAction`, `resetPasswordAction`, `resendVerificationAction`,
  `createAvatarUploadAction`, and per user `updateProfileAction`, `changePasswordAction`,
  `changeEmailAction`, `revokeSessionAction`, `revokeOtherSessionsAction`, `deleteAccountAction`)
  are rate limited in production with `consumeRateLimit`
  (`lib/data/rateLimit.ts`, Redis-backed so the limits hold across instances), because Better
  Auth's own limiter only runs in its HTTP router. It fails open: if Redis is down the attempt is
  allowed and the error is logged.
- Better Auth's `databaseHooks.user.update.after` invalidates the cached viewer (`user:<id>`), so
  changes made inside Better Auth (e.g. email verification) show up immediately.
- Sessions refresh only through Server Actions or the auth route (Server Components cannot set
  cookies), so a user who only browses is signed out when the 7-day session expires.
- Client code never reads or sends a token; the cookie is httpOnly and travels on its own.

## Posts: workflow, visibility, comments, tags

The posts example carries the domain patterns an app needs (all in `lib/data/posts.ts` and
`lib/data/comments.ts`, shapes in `lib/dto/posts.ts` and `lib/dto/comments.ts`).

- **Schema:** `Post.status` (`draft` | `published` | `archived`, default `draft`) and
  `publishedAt`; `Comment` (cascades from post and user); `Tag` (`name` unique, stored lowercased)
  and the explicit join table `PostTag` (composite id, cascades). The migration backfills posts
  that existed before the workflow to `published`.
- **Visibility:** only `published` posts are public. A draft or archived post is visible to its
  author and to admins; for anyone else `getPost` throws `NotFoundError`, the same answer as a
  missing post. `getPost` caches the viewer-independent part (`getPostBase`) and applies
  `canViewPost` and `permissions` after the cache read. `listPosts` forces `published` unless the
  viewer is an admin or lists their own posts (`authorId` equals their id); such a viewer-dependent
  result skips `remember()`. `/posts/mine` (`ROUTE_POSTS_MINE`, private) is the author's own list,
  every status, with `PostStatusActions` per row.
- **Status workflow:** `POST_STATUS_TRANSITIONS` in `lib/dto/posts.ts` is the one definition (draft
  → published; published → archived | draft; archived → published). `setPostStatus` enforces it
  (signed in → exists → author or admin → transition allowed, else `ValidationError` on `status`),
  stamps `publishedAt` on the first publication, and writes conditionally on the checked status so
  concurrent moves cannot both win. The UI (`components/Posts/StatusActions`) only offers the moves
  the map allows. `createPost` always creates a draft.
- **Transaction:** `createPost` / `updatePost` write the post and its tags in one `db.$transaction`
  (`replacePostTags`: upsert tag rows in sorted order, drop the links no longer wanted). On update,
  omitting `tags` leaves them alone and `[]` clears them. Tag names are normalized by
  `tagNameSchema` (trimmed, lowercased, at most 30 characters; at most 5 per post, de-duplicated).
- **Comments** (the nested resource): `listComments(postId)` (oldest first, capped, cached per post,
  `permissions.delete` added per viewer; it applies the same visibility rule as the post),
  `createComment` (signed in; the post must be visible and published, read from the database, not
  the cache), `deleteComment` (the comment's author, the post's author or an admin).
- **Invalidation:** `commentCount` and `tags` are embedded in cached lists and details, so every
  comment write invalidates `POSTS_TAG`, `postTag(id)` and `commentsTag(id)`, and every tag or status
  change invalidates `POSTS_TAG` and `postTag(id)`. Cached comments carry `POSTS_TAG` too, because
  commenters' names are embedded (a profile edit drops them). `listTags()` (tags of published posts
  with counts) is cached under `POSTS_TAG`.
- **UI:** the detail page stays a Server Component (status badge, `PostTags`, an async
  `CommentThread` in its own `<Suspense>`); the status buttons, `CommentForm` and
  `DeleteCommentButton` are the client leaves. `components/Form/TagsInput` is the reusable chips
  control (owns `label` / `error` like `Form/Input`); `PostForm` uses it through RHF's `Controller`.
- Tests that create posts and expect them to be public set `status: 'published'` explicitly, since
  the default is `draft`.

## Data Access Layer

- `lib/data/**` is the only code that imports `@/generated/prisma/*` or `@prisma/*`. Every file
  starts with `import 'server-only'`.
- Select exactly the columns a DTO needs (`satisfies Prisma.PostSelect`), map the row to the DTO,
  and return the DTO. Never return a Prisma row to a caller.
- **Every function validates its own inputs** with `parseInput(schema, input)` from `./errors`
  (it throws `ValidationError` with per-field messages) and works on the parsed result, which is
  where trimming and defaults are applied. The parameter stays typed with the DTO type for callers;
  the parse is what makes it true at runtime, whoever calls. Order: signed in (401) → input valid
  (422) → exists (404) → allowed (403). A read by id treats a malformed id as not found
  (`getPost('abc')` throws `NotFoundError`), so pages pass the route param straight in.
- Every function enforces auth itself: `requireUser()` / `requireAdmin()` plus inline record-level
  rules (e.g. a post may be changed by its author or an admin). For writes the order is signed in
  (401) → exists (404) → allowed (403).
- Failures are typed errors (see **Errors**), not return codes.
- Server Components call the DAL directly (wrapped in `loadPage` when they need the redirect /
  not-found behaviour). They never fetch the app's own Route Handlers. `loadPage` awaits
  `connection()` before it loads, so a page is never prerendered (and frozen) by `next build`,
  even when its read does not touch the session; a component that calls the DAL without
  `loadPage` (e.g. the layout's `getViewer()`) is session based and so is already request-time.
- `lib/data/health.ts` and `lib/data/maintenance.ts` are the two deliberate exceptions to "every
  function enforces auth": health is a public probe that returns only ok/fail per dependency, and
  maintenance is the system DAL for jobs (see **Jobs**).
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

## Route Handlers and client facades

- Use a Route Handler only when a client component must fetch (today: `GET /api/v1/posts`, the
  `/posts/csr` example). It stays thin: `parseInput` the query to decode it (every value arrives as a
  string), call the DAL (which validates again, because it trusts no caller), return JSON or
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
  `toErrorResponse` (401 / 403 / 404 / 422 with `ErrorBody`); page → `loadPage` (redirect to login, or
  `notFound()` for missing or forbidden).
- Forms map failures with `applyActionErrors` (`lib/formErrors.ts`): field errors land on their
  fields, anything else on `root.server`.

## Caching

There is one cache: the **Redis data cache** (`remember()` in `lib/server/cache.ts`), used inside
the DAL for data that is the same for every viewer. Next's Cache Components are off
(`cacheComponents` is not set), so `'use cache'`, `cacheTag` and `cacheLife` are not available; do
not turn them on to cache data, because a second cache is a copy that Redis invalidation cannot
reach. Caching is opt-in per DAL function: a new read works without `remember()`, add it when the
read is viewer independent and worth it.

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
- **Free-text search is never cached.** `listPosts` skips `remember()` when `q` is set: search terms
  are high-cardinality and would mint unbounded keys. Unfiltered and author lists keep the cache
  (`sort` is part of their key). Search input is escaped for LIKE wildcards in the DAL.
- Cache keys are built from unambiguous parts (`JSON.stringify([...])`, as `listPosts` does), never
  by joining user-controlled strings, and every input that reaches a key is bounded in its DTO
  (`page`, `authorId`), so a caller cannot collide with another entry or mint unlimited keys.
- Redis must be >= 7 (the rate limiter uses `PEXPIRE ... NX`). Run it with `maxmemory` and
  `maxmemory-policy volatile-lru`, as `docker-compose.yml` does: tag versions have no TTL and must
  not be evicted.
- Redis is an optimization, never a dependency: read, write, and invalidation errors are logged
  and the request falls through to the database. A `load()` that throws (e.g. `NotFoundError`) is
  never cached.

## Jobs

Background work runs on pg-boss (the same PostgreSQL, `pgboss` schema) in a separate worker process.

- **Definitions** (`jobs/definitions.ts`): one entry per job with its name, Zod payload schema,
  queue `options` (retries, backoff, expiry) and an optional `cron`. Payload types come from
  `z.infer` (`JobPayload<'send-email'>`). Today: `send-email`, `delete-object`, `cleanup` (hourly). `delete-object` is also queued when an
  account is deleted.
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
  `mailer.ts`, `storage.ts`, `logger.ts`. Every file starts with `import 'server-only'`.
- **Only `lib/data` (including the Better Auth config), `jobs/`, `worker/` and tests import
  `@/lib/server/*`.** ESLint forbids it from `app/`, `actions/`, `components/`, `hooks/`, `presenters/`, `lib/client` and
  `lib/dto`. A page or action that needs infrastructure asks the DAL.
- **Logging:** `lib/server/logger.ts` exports a pino `logger` (and `createLogger`, which tests use to
  capture output). Every module makes a child, `const log = logger.child({ module: 'cache' })`, and
  logs `log.error({ err: error }, 'read failed, loading from source')`: structured fields first,
  message second. `LOG_LEVEL` sets the level; otherwise `silent` in test, `info` in production
  and `debug` elsewhere. Output is JSON on stdout, except under `NODE_ENV=development` (`next dev`
  and `bun run dev:worker` set it), where it is pretty-printed with `pino-pretty`; that is a
  devDependency, so a plain `bun run worker` must never load it. `LOG_LEVEL` is read from
  `process.env` directly so the logger works before `serverEnv()` validates. `url`, `token`,
  `password` (also one level down as `*.url` etc.) and the `cookie` / `authorization` headers are
  redacted, because job payloads carry live reset and verification links. Never log a payload or a
  message body. ESLint forbids `console` in `lib/data`, `lib/server`, `jobs` and `worker/index.ts`;
  the CLI scripts `worker/migrate.ts` and `prisma/seed.ts` keep it. A test that asserts a log line
  mocks `@/lib/server/logger` with a fake child.
- Singletons (Redis, pg-boss, S3) hang off `globalThis` and are created lazily, so importing a file
  never needs its environment variables.
- `docker-compose.yml` provides Postgres, Redis and MinIO for development (`docker compose up -d`).
  Under `profiles: ['app']` it also builds the single `Dockerfile` (`node:24-slim` + bun 1.3.10, no
  `output: 'standalone'`) and runs `migrate` (one-shot: `db:deploy`, then the `pgboss` schema), `web`
  (`bun run start`, healthcheck on `/api/health`) and `worker` (`bun run worker`) from it. The
  containers get every `serverEnv()` variable with service hosts and `S3_PUBLIC_ENDPOINT`. CI is
  `.github/workflows/ci.yml` (Postgres 18 + Redis 7 services, `.env.test` from the example)

## Hooks

- Located in `hooks/`. Named `useXxx` and exported as named `const` arrow functions.
- Return objects with state and callbacks.
- **No `useMemo` / `useCallback` / `React.memo`.** The React Compiler memoizes components and
  hooks at build time (and in Vitest, through `vitest.config.mts`), so derived values and
  callbacks are plain `const`s. Two rules keep that safe:
  - **Never rely on memoization for correctness.** Code must behave the same if a value is
    recreated on every render. When an effect needs the latest props or state without re-running,
    read them through `useEffectEvent` (`NavBar`'s resize handler) instead of listing a callback
    as a dependency.
  - **A file that uses React Hook Form opts out with `'use no memo'`** below `'use client'`.
    `register()` must run on every render (a reset clears the field registry and the next render
    refills it); compiled, the call is cached and the form stops following resets and new
    `values`. ESLint fails the file if the directive is missing.
- **URL state:** `useUrlState(schema, { history })` (`hooks/useUrlState.ts`) keeps list filters in
  the query string. The schema is a Zod object whose fields all have `.default()` / `.catch()`, so
  any URL parses (`postsUrlQuery` in `lib/dto/posts.ts` is the one contract, shared with the SSR
  page's `searchParams`, which the page reduces with `toScalarParams` from `lib/searchParams.ts`:
  a repeated param reads as its last value on server and client alike). `setState(patch)` is one
  navigation per patch and is stable; each patch builds on the last query requested (not the
  committed URL), so two patches issued before the first lands both survive. Keys that are empty
  or equal to the default leave the URL, unknown params stay. Scalars only. On a page that
  reads nothing on the server the component using it must sit inside `<Suspense>` (see **React
  Components**). A filter change resets `page` in the same patch.
- **Browser storage:** `useLocalStorage(key, schema)` / `useSessionStorage(key, schema)` return
  `{ value, setValue, removeValue }`. They sit on `useSyncExternalStore` with a `null` server
  snapshot, so `value` is `null` on the server and on the first client render (no hydration
  mismatch) and also when nothing valid is stored (missing, malformed JSON, or failing the Zod
  schema). Pass a module-level schema. Quota and private-mode errors are swallowed by
  `lib/browserStorage.ts`; tabs stay in sync through the `storage` event. Do not render
  storage-dependent UI as if the value were already known on the first render. No page uses them yet;
  they are ready for per-browser state such as a dismissed banner or a saved filter.
- Only write a hook for independent logic or logic shared across components (e.g. `useScrollLock`). Never extract a hook for logic that is married to one component and gains
  nothing from the abstraction.

## Helpers & Presenters

- **Helpers** (`lib/`): exported named `const` arrow functions, no classes, no default exports. Pure
  formatting, parsing, and data utilities.
- **Presenters** (`presenters/`): plain functions, only for overrides. A presenter spreads the DTO
  and overrides or adds just the fields a view needs reshaped:
  `export const presentUser = (user) => ({ ...user, website: toAbsoluteUrl(user.website) })`.
  No classes, no presenter that only passes data through — if the DTO already fits the view, use it
  directly.
- Apply a presenter where the data is consumed: call it directly in a Server Component
  (`/posts/[userId]/[id]`) or in a client view. DTOs are plain objects, so they cross
  the Server → Client Component boundary safely; a presented value that holds a function or class
  instance would not, so present on the side that renders it.
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
  truncates `posts`, `tags` and the user tables, so new tables that hang off them are cleared too).
- `vitest.config.mts` inlines `better-auth` so its internal `next/headers` import goes through the
  mock. It also runs the React Compiler (`reactCompilerPreset`), so component and hook tests
  exercise the same memoized code that ships.
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
  DAL validates with.
- Every form component starts with `'use client'` then `'use no memo'` (see **Hooks**: React Hook
  Form is not compatible with the React Compiler). Copy an existing form to get both.
- The form component owns `useForm` and hands validated values to the page through `onSubmit`. The
  page passes an `onSubmit` that calls a Server Action and returns its `ActionResult`; the form maps
  failures with `applyActionErrors` (field errors onto fields, otherwise `message` as a form-level
  alert).
- Hydrate/build helpers (`hydrateXForm`, `buildXAttributes`) live in a `utils.ts` beside the form.
- Keep field markup explicit — no field-definition arrays, no generic FormField wrapper.
- A control that is not a native input (`components/Form/TagsInput`, a list of chips) is controlled
  and goes through RHF's `Controller`; it still owns its `label` and `error`.

## Layouts

| Route group | Use case                                               |
| ----------- | ------------------------------------------------------ |
| `(site)`    | Main pages (NavBar, content container, footer)         |
| `(minimal)` | Auth pages (`/login`, `/signup`; no navigation chrome) |

- The root `app/layout.tsx` owns fonts, global styles, and `Providers` (theme, tooltips, toaster).
- The `(site)` layout is async: it reads the session once (`getViewer()`) and passes the viewer
  to `NavBar` and `VerifyEmailBanner`. Every `(site)` route is therefore rendered per request.

## Environment & Config

- Public config comes from `NEXT_PUBLIC_*` variables read once in `lib/env.ts` — do not hardcode
  URLs or app names.
- `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` live in `.env` (dev) and `.env.test`
  (tests). Both are untracked; update the `*.example` files when adding a variable.
- `LOG_LEVEL` (optional) is read directly by `lib/server/logger.ts`, not through `serverEnv()`.
- Server-only config (`REDIS_URL`, `RESEND_API_KEY` (optional), `EMAIL_FROM`, `S3_ENDPOINT`,
  `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`,
  `S3_PUBLIC_ENDPOINT` (optional: the endpoint as the browser reaches it, for presigned uploads;
  defaults to `S3_ENDPOINT`)) is read through `serverEnv()` in `lib/server/env.ts`: Zod-validated,
  parsed on first use (so `next build` works without it), one error listing every bad variable. An
  empty optional variable counts as unset. In production `instrumentation.ts` and the worker's
  start call it at boot, so a bad config fails loudly instead of degrading the rate limiter or
  cache. Never read these from `process.env` elsewhere.
- `.env.test` points `REDIS_URL` at **database 15**; the test helpers flush it and refuse to run
  against any other database.

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
