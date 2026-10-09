# Next Template

A reusable Next.js baseline: App Router, a server-only Data Access Layer on Prisma and PostgreSQL,
Better Auth with its admin plugin, Server Actions for writes, a REST API on the same DAL, shared Zod
DTOs, schema-first forms, and shadcn/ui with SCSS everywhere else.

It is deliberately small. Everything in it is either infrastructure you keep (auth, accounts, admin,
cache, rate limits, background jobs, email, logging, tooling) or the one example resource,
**posts**, which shows every layer once and is meant to be replaced by your first real resource.

## Start here

Using this as the base of a new project:

1. `cp .env.example .env`, generate `BETTER_AUTH_SECRET`, `docker compose up -d`, `bun install`,
   `bun run db:deploy`, `bun run db:seed`, `bun run dev` and `bun run dev:worker` (details under
   **Setup**).
2. Rename the app (`NEXT_PUBLIC_APP_NAME`, `package.json`, `docker-compose.yml`'s database names).
3. Build your first resource next to posts by following **Adding a resource** below, then delete
   posts: `actions/posts.ts`, `app/(site)/posts/**`, `app/api/v1/posts/**`, `components/Posts/**`,
   `lib/dto/posts.ts`, `lib/data/posts.ts`, `lib/data/policies/posts.ts`, `lib/excerpt.ts`, the
   `Post` model and the `posts` relation on `User` in `prisma/schema.prisma` (then
   `bun run db:migrate`), `POSTS_TAG` / `postTag` in `lib/data/cacheTags.ts` and their two uses in
   `lib/data/users.ts` and `lib/data/auth.ts`, the post routes in `lib/constants-routes.ts` and
   `components/Layout/NavBar`, the posts in `prisma/seed.ts`, `posts` in `resetDatabase()`
   (`tests/helpers/server.ts`), the posts sections of `app/(site)/ui-kit/view.tsx`, the matching
   tests under `tests/`, `docs/guides/posts.md` and the rows about posts in this file. `bun run
typecheck` and `bun run lint` find whatever this list misses.

## Stack

- Next.js 16 (App Router, Turbopack), React 19 with the React Compiler, TypeScript 5.9
- Bun as the package manager (scripts run on Node 24)
- SCSS CSS Modules for all styling; shadcn/ui (Radix) + Tailwind CSS 4 only inside `components/SCN`
- lucide-react icons, sonner toasts
- Prisma ORM 7.10 (`prisma-client` generator, `@prisma/adapter-pg`) + PostgreSQL 18
- Better Auth 1.7 (email + password, optional Google sign-in, admin plugin, official Prisma adapter)
- Redis (data cache, rate limiter), pg-boss jobs, Resend for email
- Server Actions + Zod 4 DTOs; React Hook Form 7 + `@hookform/resolvers`
- Vitest + Testing Library + jsdom

## Setup

```bash
cp .env.example .env              # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
cp .env.test.example .env.test    # same for the test database
docker compose up -d              # PostgreSQL and Redis; or run them yourself
bun install                       # also generates the Prisma client (postinstall)
bun run db:deploy                 # apply migrations
bun run db:seed                   # 3 users, 12 posts (one draft each)
bun run dev                       # web process, http://localhost:3000
bun run dev:worker                # in a second terminal: background jobs (emails, cleanup)
```

Log in as `leanne@example.com` / `password123` (admin: `admin@example.com` / `password123`), or
create an account at `/signup`.

The app needs two services: **PostgreSQL >= 15** (18 in `docker-compose.yml`) and **Redis >= 7**.
If you run them yourself, create the `next_template_dev` and `next_template_test` databases, point
`REDIS_URL` in `.env` at your Redis, and put the matching values in `.env.test` (Redis
**database 15**: the tests flush it). Redis 7 is a hard minimum: the rate limiter uses
`PEXPIRE ... NX`. The compose Redis sets `maxmemory` with the `volatile-lru` policy; use the same on
a shared instance so only expiring keys can be evicted.

The **worker** is a second process (`bun run worker`, or `dev:worker` to restart on changes). Without
it, jobs pile up in the queue: no verification or reset email is sent and the hourly cleanup does
not run. Without `RESEND_API_KEY`, the worker logs emails instead of sending them, so the
verification and reset links are right there in its output. That fallback is for development only:
with `NODE_ENV=production` the send job fails (and is retried) until the key is set, and nothing is
logged.

`db:seed` and `db:reset` write straight to PostgreSQL and do not flush the Redis cache, so `/posts`
can show pre-reset data for up to 5 minutes (`redis-cli -n 0 flushdb` clears it).

## Run everything with Docker

```bash
cp .env.example .env              # required: BETTER_AUTH_SECRET; optional: RESEND_API_KEY, EMAIL_FROM
docker compose --profile app up --build
docker compose --profile app run --rm -e ALLOW_SEED=1 migrate bun run db:seed   # once, in a second terminal
```

Then open http://localhost:3000 and check `curl localhost:3000/api/health`. `ALLOW_SEED=1` is needed
because the containers run with `NODE_ENV=production`, where the seed refuses to run by default (it
creates `admin@example.com` with the public password `password123`).

`docker compose up -d` without the profile still starts only PostgreSQL and Redis, which is what
`bun run dev` expects. The `app` profile adds three services built from one `Dockerfile`
(`node:24-slim` plus bun 1.3.10):

| Service   | Command                                       | Notes                                                                     |
| --------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| `migrate` | `bun run db:deploy`, then `worker/migrate.ts` | One-shot: Prisma migrations, then the `pgboss` schema. Builds the image.  |
| `web`     | `bun run start`                               | Port 3000 on loopback; healthcheck on `/api/health`; waits for `migrate`. |
| `worker`  | `bun run worker`                              | Background jobs; waits for `migrate`.                                     |

Compose reads `.env` for `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and the `NEXT_PUBLIC_*` build args; every other container
variable is fixed in `docker-compose.yml`. `BETTER_AUTH_SECRET` is required: compose refuses to start
without it. Production boot (`instrumentation.ts`) also refuses a missing, short or placeholder
secret and a missing `BETTER_AUTH_URL`. `NEXT_PUBLIC_*` values are baked into the bundle at build
time; everything else is read at runtime.

**Deploying behind a proxy.** Every per-IP rate limit (`getClientIp` in `lib/data/rateLimit.ts`)
reads the client address from `x-forwarded-for`, so the app must sit behind at least one proxy that
appends the client address. Set `TRUSTED_PROXY_HOPS` (default `1`) to the number of such proxies
(a CDN plus a load balancer is `2`). The compose `web` service has no proxy, so its port is bound to
`127.0.0.1`.

> The image build and the compose `app` profile have not been run end to end on the machine this was
> written on (no Docker daemon there); `docker compose config` passes. Treat the first
> `docker compose --profile app up --build` as the test.

## Scripts

| Script                    | What it does                                                            |
| ------------------------- | ----------------------------------------------------------------------- |
| `bun run dev`             | Next dev server (Turbopack).                                            |
| `bun run build`           | Production build.                                                       |
| `bun run start`           | Serve the production build.                                             |
| `bun run worker`          | Background worker (pg-boss jobs and cron).                              |
| `bun run dev:worker`      | The worker with `tsx watch`.                                            |
| `bun run lint`            | ESLint.                                                                 |
| `bun run format`          | Prettier, write.                                                        |
| `bun run format:check`    | Prettier, check only.                                                   |
| `bun run typecheck`       | `prisma generate`, `next typegen`, then `tsc --noEmit`.                 |
| `bun run test`            | Vitest, single run.                                                     |
| `bun run test:watch`      | Vitest in watch mode.                                                   |
| `bun run db:generate`     | Regenerate the Prisma client into `generated/` (also runs on install).  |
| `bun run db:migrate`      | Create and apply a migration to the dev DB, then regenerate.            |
| `bun run db:deploy`       | Apply pending migrations only (CI / production).                        |
| `bun run db:seed`         | Seed the dev DB (`prisma/seed.ts`, replaces the seeded users).          |
| `bun run db:reset`        | Drop, re-migrate, and re-seed the dev DB.                               |
| `bun run db:studio`       | Prisma Studio.                                                          |
| `bun run db:test:prepare` | Reset and migrate the database in `.env.test`, install `pgboss` schema. |

## Testing

Copy `.env.test.example` to `.env.test`, run `bun run db:test:prepare` once per schema change (and
whenever the test DB may be dirty), then `bun run test`. Server tests call the DAL, Server Actions,
and Route Handlers directly against `next_template_test` and Redis database 15 (flushed between
tests) and never touch the dev database. The job queue is mocked, so no email is ever sent.
Component, presenter, and DTO tests need no database.

## Architecture

```
prisma/schema.prisma ──prisma generate──▶ generated/prisma (git-ignored)

lib/dto/*  Zod schemas: inputs and outputs, types via z.infer (client- and server-safe)
lib/data/* server-only DAL: the only code that touches Prisma; enforces auth; validates inputs; returns DTOs

Server Component ─────────────────▶ lib/data ──▶ PostgreSQL
                                           └──▶ Redis, job queue (lib/server) ──▶ worker/ ──▶ Resend
Server Action (actions/*) ────────▶ lib/data
Route Handler (app/api/v1) ───────▶ lib/data   (decodes with lib/dto, answers JSON)
```

**Styling and `components/SCN`.** `styles/global.css` contains the official shadcn neutral theme,
light/dark tokens, and Tailwind base styles. Application CSS Modules use those tokens directly.
`components/SCN` holds stock CLI-generated primitives, with no local styling or API overrides.
Forms use `components/Form/Input` and `components/Form/Textarea` for labels and errors;
`LoadingButton` composes the stock Button and Spinner. Callers do not pass `className` or `style`
to application components. Read `AGENTS.md` for the full rules. Add or reinstall primitives with
`bunx shadcn@latest add button input textarea --overwrite --yes`; keep `lib/utils.ts` dedicated to
the CLI's `cn` utility. The `/ui-kit` catalog exercises the components and the theme toggle.

**DTOs.** `lib/dto` holds Zod schemas for inputs (`createPostInput`, `signUpInput`) and outputs
(`postSummarySchema`, `postDetailSchema`); `z.infer` gives the types. Output schemas use
`z.coerce.date()`, so a client parsing JSON gets `Date` back. Lists are `Page<T>`.

**Data Access Layer.** `lib/data/*` is `server-only` and the only code that imports Prisma (ESLint
enforces it). Each function selects exactly the columns its DTO needs, maps the row to the DTO, and
enforces auth itself with `requireUser()` / `requireAdmin()` plus record-level rules
(`lib/data/policies`: a post may be changed by its author or an admin). It also validates its own
inputs with the `lib/dto` schema (`parseInput`), so the rules hold whichever caller reaches it.

**Server Actions.** Writes live in `actions/`: call the DAL (it validates),
`revalidatePath` / `refresh`, and return an `ActionResult<T>`. Forms map failures onto fields with
`applyActionErrors`.

**Caching and rendering.** Pages are async Server Components rendered per request; they await
their data, so redirects and not-found pages answer with real status codes. Redis is the only
cache: the DAL caches viewer-independent reads with tag versions and invalidates inside the write
functions. Next's Cache Components (`'use cache'`) are off, so there is no second cache to keep in
sync.

**Jobs and email.** `jobs/definitions.ts` lists each job (name, Zod payload, retry options, cron).
`enqueue()` validates and sends; the worker runs the handlers. Better Auth's verification, reset and
email-change mails are queued as `send-email` jobs without awaiting (so response time cannot reveal
whether an account exists); the worker renders the plain templates in `emails/` and sends through
Resend, or logs the mail when no key is set. Jobs that touch the database use the system DAL
`lib/data/maintenance.ts`, importable only from `jobs/`.

**Route Handlers.** The REST endpoints below exist for HTTP API clients; no UI calls them. Each
handler reads the body with `readJsonBody`, decodes it with the DTO schema, and passes it, with the
raw route `id`, to the DAL, which validates again and authorizes. Authentication is the session
cookie; writes require `Content-Type: application/json` (a cross-site form cannot send it without a
CORS preflight, which together with the `SameSite=Lax` cookie is the CSRF guard).

| Method   | Path                 | Auth                                                 | Success                                                                                  |
| -------- | -------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET`    | `/api/v1/posts`      | none (drafts: own list, or admin with `published`)   | 200 `Page<PostSummary>`; filters `q`, `sort`, `published`, `authorId`, `page`, `perPage` |
| `POST`   | `/api/v1/posts`      | signed in                                            | 201 `PostDetail`                                                                         |
| `GET`    | `/api/v1/posts/{id}` | none for a published post; author or admin otherwise | 200 `PostDetail`                                                                         |
| `PATCH`  | `/api/v1/posts/{id}` | author or admin                                      | 200 `PostDetail` (`title`, `body`, `published`; at least one)                            |
| `DELETE` | `/api/v1/posts/{id}` | author or admin                                      | 204, empty body                                                                          |

Errors are `{ code, message, fieldErrors? }` with 401, 403, 404, 422 (validation, including a
non-JSON content type or malformed JSON) or 429. `GET /api/health` returns 200 when PostgreSQL and
Redis answer and 503 otherwise (ok/fail per dependency, no error text).

**Errors.** The DAL throws `UnauthorizedError`, `ForbiddenError`, `NotFoundError`,
`ValidationError` and `RateLimitedError`. Actions turn them into `ActionResult` failures, the Route
Handler into 401/403/404/422/429 JSON, and `loadPage` into a login redirect or `notFound()`.

**Presenters.** Types are the source of truth; presenters exist only for overrides. A presenter is
a plain function that spreads the DTO and replaces just the fields a view needs reshaped
(`presentUser` turns a bare `website` domain into a linkable URL).

**Auth.** Better Auth with email + password, database sessions, the `admin` plugin and the
`nextCookies` plugin. `proxy.ts` redirects private routes to `/login?next=...` when the session
cookie is absent (unknown paths count as private); it only checks cookie presence, so the `/login`
and `/signup` pages redirect signed-in users themselves (a stale cookie must not lock anyone out).
The DAL does the real check on every read and write. Sign-up sends a verification email and the
login form links to a password reset. Verification is soft: unverified users can sign in and see a
banner with a Resend button. Resetting a password signs out every session.

Better Auth's HTTP routes that would bypass the DAL's validation and rate limits (`/sign-up/email`,
`/sign-in/email`, `/update-user`, `/delete-user`, the password and email changes, and every
`/admin/*` route of the admin plugin) are disabled; the matching Server Actions and DAL functions
are the only way in. Auth and account actions are rate limited in production (Redis-backed, so
shared across instances; if Redis is down the attempt is allowed). Full detail in
[`docs/guides/authentication.md`](docs/guides/authentication.md).

`/settings` is the account page: profile (name, username, website), email change (confirm at the
current address, verify the new one), password change, active sessions (revoke one or all others)
and account deletion (password required; posts and sessions cascade).

**Admin.** `/admin` (admins only; anyone else gets the not-found page, signed-out visitors go to
login) lists users with search and pagination and lets an admin change a role, ban or unban a user
(a banned user is signed out everywhere and cannot sign in; the reason is shown to them), and
impersonate a regular user (a one-hour session with a banner and a "Stop impersonating" button).
Reads are the app's own queries; writes wrap the admin plugin's server API (`auth.api.setRole`,
`banUser`, `impersonateUser`, …) behind `requireAdmin()` and one extra rule: an admin cannot change
their own role, so the last admin cannot lock everyone out.

**Google sign-in (optional).** With `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` both set, `/login`
and `/signup` show a "Continue with Google" button; with neither set the button is absent and
nothing else changes. Setting only one fails at boot in production. Add the authorized redirect URI
`<BETTER_AUTH_URL>/api/auth/callback/google` in the Google Cloud Console. A new Google user gets a
username derived from the email's local part plus a random suffix (they can change it in
settings); a Google-only account has no password, so `/settings` points it to "Forgot password" to
set one. The round trip with Google has not been run here (it needs real credentials).

## Pattern index

Where to look to see each pattern done once, properly.

| Pattern                               | Where it is shown                                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-rendered list with URL filters | `app/(site)/posts/page.tsx` + `view.tsx`; `hooks/useUrlState.ts`; `postsUrlQuery` in `lib/dto/posts.ts`; `components/Posts/Filters`                             |
| Create / edit form with field errors  | `components/Posts/Form/index.tsx` (+ `utils.ts`); `lib/formErrors.ts` (`applyActionErrors`); `actions/posts.ts`; pages `/posts/new` and `/posts/[id]/edit`      |
| Controlled form field                 | the Published `Checkbox` wired through RHF's `Controller` in `components/Posts/Form/index.tsx`                                                                  |
| Record-level authorization policies   | `lib/data/policy.ts` (`authorize`, `permissionsFor`); `lib/data/policies/posts.ts` (`postPolicy`); used by `requirePostChange` in `lib/data/posts.ts`           |
| Viewer-dependent visibility           | `postPolicy.view`, `getPost` and `listPosts` in `lib/data/posts.ts` (cache the shared part, check the viewer after)                                             |
| Redis caching and invalidation        | `remember` / `invalidateTags` in `lib/server/cache.ts`; tags in `lib/data/cacheTags.ts`; used in `lib/data/posts.ts` and `lib/data/users.ts`                    |
| REST CRUD handlers                    | `app/api/v1/posts/route.ts`, `app/api/v1/posts/[id]/route.ts`; `readJsonBody` and `toErrorResponse` in `lib/data/errors.ts`                                     |
| Rate limiting                         | `consumeRateLimit` / `getClientIp` in `lib/data/rateLimit.ts`; per IP and per account in `actions/auth.ts`, per user in `createPost`                            |
| Wrapping a Better Auth plugin         | `lib/data/admin.ts` (`setUserRole`, `banUser`, `impersonateUser` over `auth.api.*`); `actions/admin.ts`; page `app/(site)/admin`                                |
| Admin-only page                       | `app/(site)/admin/page.tsx` + `view.tsx`; `listUsers` with `requireAdmin()` in `lib/data/admin.ts`; `loadPage` turns 403 into the not-found page                |
| Account settings on Better Auth       | `actions/auth.ts` (`changePasswordAction`, `changeEmailAction`, `deleteAccountAction`); `lib/data/sessions.ts`; `app/(site)/settings`                           |
| Background job and email              | `jobs/definitions.ts`, `jobs/sendEmail.ts`, `jobs/cleanup.ts`; `lib/server/queue.ts`; `worker/index.ts`; `lib/server/mailer.ts`; `emails/`                      |
| OAuth (Google)                        | `lib/data/auth.ts` (`socialProviders`, `isGoogleAuthEnabled`); `signInWithGoogleAction` in `actions/auth.ts`; `lib/username.ts`; `components/Auth/GoogleButton` |
| Health check                          | `lib/data/health.ts`; `app/api/health/route.ts`                                                                                                                 |

## Design decisions

- **One contract.** Three paths (Server Component, Server Action, Route Handler) end at the same DAL
  function and return the same DTO type under the same auth rules.
- **DAL and DTO boundary.** Prisma rows never leave `lib/data`; callers only see Zod-defined DTOs, and
  the DAL's `select` plus mapping make schema drift a compile error.
- **Auth in the DAL.** A page, action, or proxy that forgets a check cannot bypass authorization,
  because the data functions enforce it themselves.
- **Server Actions vs Route Handlers.** Actions for UI writes (no extra HTTP surface to design);
  a Route Handler where an HTTP API is required or a client has to fetch.
- **Typed errors per caller.** One set of error classes, translated once per transport.
- **Small on purpose.** File uploads, notifications, an audit log, soft delete, optimistic
  locking, full-text search and comments were all built once in this template and then removed,
  because every project that started from it had to delete them. `docs/recipes/` says how
  to add each one back in this architecture, and `docs/DECISIONS.md` ("Removed") where it is in the
  history.

## Adding a resource

The posts domain is the worked example; copy its shape. In this order:

1. **Schema.** Add the model to `prisma/schema.prisma` (camelCase fields with snake_case `@map`s,
   an index on every foreign key you filter by, `onDelete: Cascade` where the child cannot outlive
   its parent), then `bun run db:migrate` and `bun run db:test:prepare`. A new table that does not
   hang off `users` goes into `resetDatabase()`'s TRUNCATE list in `tests/helpers/server.ts`.
2. **DTOs** in `lib/dto/<name>.ts`: one input schema per write, one output schema per read shape
   (`...Summary` for lists, `...Detail` for one record), output dates with `z.coerce.date()`, list
   query schemas with every field bounded. A URL-facing twin (`xxxUrlQuery`) with `.catch()` on
   every field if the list keeps its filters in the query string.
3. **DAL** in `lib/data/<name>.ts`: `import 'server-only'`; per function: `requireUser()` /
   `requireAdmin()`, then `parseInput`, then existence, then permission; select exactly the DTO
   columns and map rows to DTOs; typed errors only. Use `db.$transaction` when one write touches
   several tables. Cache with `remember()` only the viewer-independent, bounded reads, and invalidate
   inside the write functions (new tags go in `lib/data/cacheTags.ts`). Put the record-level rules
   (who may view, edit, delete) in `lib/data/policies/<name>.ts` as pure functions of `(viewer,
record)`, call them with `authorize()` after the exists check, and build the DTO's `permissions`
   with `permissionsFor()` (`lib/data/policy.ts`). Test it first, in `tests/lib/data/<name>.test.ts`,
   per viewer (signed out, owner, other user, admin).
4. **Server Actions** in `actions/<name>.ts`: pass the arguments to the DAL untouched, then
   `revalidatePath` / `refresh`, return `ActionResult<T>` through `toActionFailure`. Add a Route
   Handler under `app/api/v1/<name>/` (thin: decode with the DTO schema, call the DAL, return JSON
   or `toErrorResponse`) only for an HTTP API or a client component that must fetch.
5. **Pages and forms.** `page.tsx` is an async Server Component: await `params` / `searchParams`,
   load through `loadPage`, render. Add a `'use client'` `view.tsx` beside it only for what is
   interactive. Forms use React Hook Form with the DTO schema, start with the `'use client'` /
   `'use no memo'` header (copy `components/Posts/Form`) and map failures with `applyActionErrors`.
   Styles are an SCSS module with shadcn tokens.
6. **Routes and navigation.** Add the route constants to `lib/constants-routes.ts` and decide
   whether each route is public (`PUBLIC_ROUTES`) or private (the default); add the NavBar link.
7. **Only if a view needs reshaped fields**, add `presentX` in `presenters/<Name>Presenter.ts`.
8. **Seed and tests.** Extend `prisma/seed.ts`; add `tests/actions/<name>.test.ts`, component tests
   under `tests/components/`, and handler tests under `tests/app/api/v1/` when there is a handler.

## More

- [`docs/DECISIONS.md`](docs/DECISIONS.md): what was chosen and why, and what was removed and where it went.
- [`AGENTS.md`](AGENTS.md): project conventions and rules for contributors and agents.
- Area guides in [`docs/guides/`](docs/guides/): authentication, posts, route-handlers, caching,
  jobs, email, infrastructure, hooks, forms, environment.
- Recipes in [`docs/recipes/`](docs/recipes/) for what the template leaves out: concurrency and
  optimistic locking, file uploads, and the other removed patterns.
