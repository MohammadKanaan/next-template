# Next Template

A reusable Next.js baseline: App Router, a server-only Data Access Layer on Prisma and PostgreSQL, Better
Auth, Server Actions for writes, shared Zod DTOs, schema-first forms, and shadcn/ui with SCSS everywhere else.

## Start here

Using this as the base of a new project? Roughly:

**Keep as is** (the infrastructure, none of it is specific to posts):

- Auth and accounts: Better Auth config, sign-in/sign-up/reset/verify flows, `/settings` (profile,
  email change, password, sessions, avatar, account deletion), optional Google sign-in, `/admin`
  (user list and roles), `proxy.ts`, the rate limiter.
- The layering and its helpers: `lib/dto` conventions, `lib/data` (`db`, `auth`, `errors`, `page`,
  `rateLimit`, `sessions`, `users`, `uploads`, `health`, `maintenance`), `lib/server/*`, `actions/`
  conventions, `lib/formErrors.ts`, `types/api.ts`, `hooks/`.
- Jobs and email (`jobs/`, `worker/`, `emails/`), uploads, `GET /api/health`, logging.
- Tooling: `Dockerfile`, `docker-compose.yml`, CI, ESLint rules, the test helpers in `tests/helpers`,
  `components/SCN` plus the small application wrappers (`Form/Input`, `Form/Textarea`,
  `LoadingButton`, `Pagination`, `PageHeader`, `Empty`).

**Example code to adapt or strip** (it exists to show the patterns in the index below):

- The posts, comments and tags domain: the `Post`, `Comment`, `Tag`, `PostTag` models and their
  migrations, `lib/dto/posts.ts`, `lib/dto/comments.ts`, `lib/data/posts.ts`, `lib/data/comments.ts`,
  `actions/posts.ts`, `actions/comments.ts`, `app/(site)/posts/**`, `components/Posts`,
  `components/Comments`, `components/Form/TagsInput` (reusable; keep it if you want a chips field),
  the seed data in `prisma/seed.ts`, and their tests. Rename or replace; do not leave half of it.
  Places outside those files that mention posts and need a look when you remove them: `POSTS_TAG` in
  `lib/data/auth.ts` (`afterDelete`), `lib/data/users.ts` (`updateProfile`, `postCount` in the admin
  list), `lib/data/cacheTags.ts`, the NavBar links and `AUTHORING_ROUTE_PATTERN` in
  `lib/constants-routes.ts`, and `listTags` / `getSiteStats` consumers.
- `/dashboard` and `lib/data/stats.ts` (aggregate examples; the numbers are about posts).
- The SSR-vs-CSR comparison pages `/posts/ssr` and `/posts/csr`, with `lib/client/posts.ts` and the
  `GET /api/v1/posts` handler behind the client one. Keep the facade pattern if a client component
  of yours must fetch; drop it otherwise. The REST write endpoints under `app/api/v1/posts` are
  only for HTTP API consumers; no UI calls them.
- `/ui-kit` (a component catalog) and the home page placeholder (`app/(site)/page.tsx`).

**Order to build a new resource** (details in "Adding a resource" below): schema and migration →
DTOs → DAL (auth, validation, caching, tests) → Server Actions → pages and forms → seed → route
constants and navigation. Write the DAL tests before the UI: the DAL is where the rules live.

## Stack

- Next.js 16 (App Router, Turbopack), React 19 with the React Compiler, TypeScript 5.9
- Bun as the package manager (scripts run on Node 24)
- SCSS CSS Modules for all styling; shadcn/ui (Radix) + Tailwind CSS 4 only inside `components/SCN`
- lucide-react icons, sonner toasts
- Prisma ORM 7.10 (`prisma-client` generator, `@prisma/adapter-pg`) + PostgreSQL 18
- Better Auth 1.7 (email + password, optional Google sign-in, official Prisma adapter)
- Redis (data cache, rate limiter), pg-boss jobs, Resend + React Email, S3-compatible storage (MinIO in dev)
- Server Actions + Zod 4 DTOs; React Hook Form 7 + `@hookform/resolvers`
- Vitest + Testing Library + jsdom

## Setup

```bash
cp .env.example .env              # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
cp .env.test.example .env.test    # same for the test database
docker compose up -d              # PostgreSQL, Redis, MinIO (+ bucket init); or run them yourself
bun install                       # also generates the Prisma client (postinstall)
bun run db:deploy                 # apply migrations
bun run db:seed                   # 4 users, 16 posts (drafts, published, archived), tags, comments
bun run dev                       # web process, http://localhost:3000
bun run dev:worker                # in a second terminal: background jobs (emails, cleanup)
```

Open http://localhost:3000 and log in as `leanne@example.com` / `password123` (admin:
`admin@example.com` / `password123`), or create an account at `/signup`.

The app needs three services: **PostgreSQL >= 15** (18 in `docker-compose.yml`), **Redis >= 7**, and an
**S3-compatible store** (MinIO, bucket `next-template`, `avatars/` publicly readable). Compose
starts all three (the MinIO images are Chainguard builds that have not been verified end to end).
If you run them yourself, create the `next_template_dev` and `next_template_test` databases, point
`REDIS_URL` and the `S3_*` variables in `.env` at your services, and put the matching values in
`.env.test` (Redis **database 15**: the tests flush it). Redis 7 is a hard minimum: the rate limiter
uses `PEXPIRE ... NX`, which Redis 6 rejects. The compose Redis sets `maxmemory` with the
`volatile-lru` policy; use the same on a shared instance so only expiring keys can be evicted.

Uploads go from the browser straight to the bucket. If the server reaches storage over an internal
host (for example `S3_ENDPOINT=http://minio:9000` in containers), set `S3_PUBLIC_ENDPOINT` to the
address the browser uses; it defaults to `S3_ENDPOINT`. On real S3, add a bucket CORS rule that
allows `POST` from your site's origin (`AllowedMethods: ["POST"]`, `AllowedOrigins: [your origin]`,
`AllowedHeaders: ["*"]`); MinIO allows all origins by default.

`db:seed` and `db:reset` write straight to PostgreSQL and do not flush the Redis cache, so `/posts`
can show pre-reset data for up to 5 minutes. Wait it out or flush Redis yourself
(`redis-cli -n 0 flushdb`).

The **worker** is a second process (`bun run worker`, or `dev:worker` to restart on changes). Without
it, jobs pile up in the queue: no verification or reset emails are sent and cleanup does not run.
With `RESEND_API_KEY` unset, emails are printed in the worker console instead of sent, so the
verification and reset links are right there. That fallback is for development only: with
`NODE_ENV=production` the send job fails (and is retried) until the key is set, and nothing is
logged. The web process builds the links from `BETTER_AUTH_URL` and puts them in the job, so the
worker does not need that variable.

**Existing checkouts:** the dev database from before the Prisma 7 / Better Auth refactor holds the
old Prisma 8 schema. Run `bun run db:reset` once; it drops, re-migrates, and re-seeds the dev
database (it destroys that data).

## Run everything with Docker

```bash
cp .env.example .env              # required: generate BETTER_AUTH_SECRET (openssl rand -base64 32); optional: RESEND_API_KEY, EMAIL_FROM
docker compose --profile app up --build
docker compose --profile app run --rm -e ALLOW_SEED=1 migrate bun run db:seed   # once, in a second terminal
```

Then open http://localhost:3000 (same seeded accounts as above) and check
`curl localhost:3000/api/health`. `ALLOW_SEED=1` is needed because the containers run with
`NODE_ENV=production`, where the seed refuses to run by default (it creates `admin@example.com` with
the public password `password123`).

`docker compose up -d` without the profile still starts only PostgreSQL, Redis and MinIO, which is what
`bun run dev` expects. The `app` profile adds three services built from one `Dockerfile`
(`node:24-slim` plus bun 1.3.10, because the scripts run on Node and bun only installs and launches
them):

| Service   | Command                                       | Notes                                                                     |
| --------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| `migrate` | `bun run db:deploy`, then `worker/migrate.ts` | One-shot: Prisma migrations, then the `pgboss` schema. Builds the image.  |
| `web`     | `bun run start`                               | Port 3000 on loopback; healthcheck on `/api/health`; waits for `migrate`. |
| `worker`  | `bun run worker`                              | Background jobs; waits for `migrate`.                                     |

The containers get every variable the app validates at boot. Hosts are the compose service names
(`db`, `redis`, `minio`); `S3_PUBLIC_ENDPOINT=http://localhost:9000` is what the browser uses for
avatar uploads. Compose reads `.env` from the project directory for `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and
the `NEXT_PUBLIC_*` build args. `BETTER_AUTH_SECRET` is required: compose refuses to start the `app`
profile without it (it interpolates the whole file, so even `docker compose up -d` needs it set). Production boot
(`instrumentation.ts`) also refuses a missing, short or placeholder secret and a missing
`BETTER_AUTH_URL`.
The infrastructure ports (PostgreSQL, Redis, MinIO) are bound to `127.0.0.1`, so they are not
reachable from the network. Every other container variable is fixed in
`docker-compose.yml`, so the `localhost` URLs in your `.env` never leak into the containers. The containers run with
`NODE_ENV=production`, so without `RESEND_API_KEY` the email jobs fail and are retried (nothing is
logged); sign-in with the seeded accounts does not need email. The image's `bun run build` step gets
a build-only placeholder `BETTER_AUTH_SECRET` inline (not as `ENV`, so it is not in the image),
because the auth module refuses to load without a secret in production mode; CI does the same.

`NEXT_PUBLIC_*` values are baked into the bundle at build time (build args); everything else is read
at runtime. The seed replaces the seeded rows, so it is an explicit command and not part of
`migrate`; like `bun run db:seed` it does not flush Redis.

**Deploying behind a proxy.** Every per-IP rate limit (`getClientIp` in `lib/data/rateLimit.ts`) reads
the client address from `x-forwarded-for`. Next exposes no socket address and only fills that header
when the client did not send one, so the app must sit behind at least one proxy that appends the
client address; a directly exposed server lets every client pick its own limit bucket. Set
`TRUSTED_PROXY_HOPS` (default `1`) to the number of such proxies in front of the app (a CDN plus a
load balancer is `2`): the entry that many from the end of `x-forwarded-for` is the client. The compose
`web` service has no proxy, so its port is bound to `127.0.0.1`; put a proxy in front of it before
exposing it.

> **Not verified on the machine this was written on:** Docker was not running there, so the image
> build and the full stack run were never executed. `docker compose config` and
> `docker compose --profile app config` pass, and `.github/workflows/ci.yml` (PostgreSQL 18 and
> Redis 7 service containers, then `db:test:prepare`, `format:check`, `lint`, `typecheck`, `test`,
> `build`) has not run either. Treat the first `docker compose --profile app up --build` as the test.

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
whenever the test DB may be dirty), then `bun run test`. Server tests call the DAL, Server Actions, and
Route Handlers directly against `next_template_test` and Redis database 15 (flushed between tests) and
never touch the dev database. Storage and Resend are mocked, so MinIO is not needed. Component,
presenter, and DTO tests need no database.

## Backend services

| Service    | Used for                                                              | Code                                           |
| ---------- | --------------------------------------------------------------------- | ---------------------------------------------- |
| PostgreSQL | All data; also the job queue (pg-boss, `pgboss` schema)               | `lib/data`, `prisma/`, `jobs/`                 |
| Redis      | Data cache (versioned tags, fail-open) and the shared rate limiter    | `lib/server/cache.ts`, `lib/data/rateLimit.ts` |
| Worker     | Sends email, deletes replaced objects, hourly cleanup of expired rows | `worker/`, `jobs/`                             |
| Resend     | Verification and password-reset email (console log without a key)     | `lib/server/mailer.ts`, `emails/`              |
| S3 / MinIO | Avatar uploads, browser POSTs straight to the bucket (`/settings`)    | `lib/server/storage.ts`, `lib/data/uploads.ts` |

`GET /api/health` returns 200 when PostgreSQL and Redis answer and 503 otherwise (ok/fail per
dependency, no error text); point a load balancer or container probe at it.

The web and worker processes run from the one `Dockerfile` (see "Run everything with Docker"), or
directly with `bun run build` then `bun run start` and `bun run worker`, both with the same
environment. In production both validate the server env at boot (`instrumentation.ts`, and the
worker's start) and exit on a bad value. The image does not use `output: 'standalone'`: the worker
runs the TypeScript source through `tsx`, so it needs the source and `node_modules` anyway.

## Architecture

```
prisma/schema.prisma ──prisma generate──▶ generated/prisma (git-ignored)

lib/dto/*  Zod schemas: inputs and outputs, types via z.infer (client- and server-safe)
lib/data/* server-only DAL: the only code that touches Prisma; enforces auth; validates inputs; returns DTOs

Server Component ───────────────────────────────────────────▶ lib/data ──▶ PostgreSQL
                                                                      └──▶ Redis / S3 / job queue (lib/server)
Server Action (actions/*) ──────────────────────────────────▶ lib/data
Client facade (lib/client) ─fetch─▶ Route Handler (app/api/v1) ▶ lib/data   (parsed with lib/dto)
```

**Styling and `components/SCN`.** `styles/global.css` contains the official shadcn neutral theme,
light/dark tokens, and Tailwind base styles. Application CSS Modules use those tokens directly.
`components/SCN` holds stock CLI-generated primitives, with no local styling or API overrides.
Forms use `components/Form/Input` and `components/Form/Textarea` for labels and errors;
`LoadingButton` composes the stock Button and Spinner. Callers do not pass `className` or `style`
to application components. Read `AGENTS.md` for the full rules.

The theme menu in navigation offers light, dark, and system preferences. `next-themes` defaults to
system, saves the selection, and updates the stock Toaster too. The `/ui-kit` catalog exercises
the components and theme selector.

Add or reinstall primitives using the official CLI:

```bash
bunx shadcn@latest add button input textarea --overwrite --yes
```

Keep `lib/utils.ts` dedicated to the CLI's `cn` utility; put application helpers in separate files.
Official references: [CLI](https://ui.shadcn.com/docs/cli),
[theming](https://ui.shadcn.com/docs/theming), and
[Next.js dark mode](https://ui.shadcn.com/docs/dark-mode/next).

**DTOs.** `lib/dto` holds Zod schemas for inputs (`createPostInput`, `signUpInput`) and outputs
(`postSummarySchema`, `postDetailSchema`); `z.infer` gives the types. Output schemas use
`z.coerce.date()`, so a client parsing JSON gets `Date` back. Lists are `Page<T>`.

**Data Access Layer.** `lib/data/*` is `server-only` and the only code that imports Prisma (ESLint
enforces it). Each function selects exactly the columns its DTO needs, maps the row to the DTO, and
enforces auth itself with `requireUser()` / `requireAdmin()` plus record-level rules (a post may be
changed by its author or an admin). It also validates its own inputs with the `lib/dto` schema
(`parseInput`), so the rules hold whichever caller reaches it.

**Aggregates.** `/dashboard` shows stat cards and a posts-per-day chart. `lib/data/stats.ts` has
the three flavours side by side: plain counts, Prisma `groupBy` (the viewer's posts per status), and
one raw SQL query (`generate_series` + `date_trunc`, via the `$queryRaw` tagged template, rows
parsed with a Zod schema). Site-wide numbers and the series are cached under `POSTS_TAG`; the
viewer's own numbers under a per-user key. The chart is shadcn's `chart` primitive (Recharts) and
the only client component on the page. The Prisma client sets its session time zone to UTC so the
raw day grouping matches what Prisma returns.

**Server Actions.** Writes live in `actions/`: call the DAL (it validates),
`revalidatePath` / `refresh`, and return an `ActionResult<T>`. Forms map failures onto fields with
`applyActionErrors`.

**Caching and rendering.** Pages are async Server Components rendered per request; they await
their data, so redirects and not-found pages answer with real status codes. Redis is the only
cache: the DAL caches viewer-independent reads with tag versions and invalidates inside the write
functions. Next's Cache Components (`'use cache'`) are off, so there is no second cache to keep in
sync.

**Jobs and email.** `jobs/definitions.ts` lists each job (name, Zod payload, retry options, cron).
`enqueue()` validates and sends; the worker runs the handlers. Jobs that touch the database use the
system DAL `lib/data/maintenance.ts`, importable only from `jobs/`.

**Uploads.** The server issues a presigned POST and records an `Upload` row; the browser sends the
file straight to storage; attaching re-checks the object, updates `user.image`, and queues a delayed
deletion of the replaced avatar (after its ticket can no longer be used). Abandoned uploads are cleaned up hourly.
Because those deletions are delayed by the ticket lifetime plus a grace period, a replaced avatar,
and the avatars of a deleted account, stay readable at their public URL for about 15 minutes.

**Route Handlers and facade.** `GET /api/v1/posts` is called by a client component (`/posts/csr`)
through `lib/client/posts.ts`, which parses the response with the shared schema. The write endpoints
below exist for HTTP API clients; no UI calls them, so they have no facade. Each handler reads the
body with `readJsonBody`, decodes it with the DTO schema, and passes it, with the raw route `id`, to the DAL, which validates again and
authorizes. Authentication is the session cookie; writes require `Content-Type: application/json`
(a cross-site form cannot send it without a CORS preflight, which together with the `SameSite=Lax`
cookie is the CSRF guard).

| Method   | Path                          | Auth                                            | Success                                                                                                    |
| -------- | ----------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/v1/posts`               | none (drafts: own list, or admin with `status`) | 200 `Page<PostSummary>`; filters `q`, `sort`, `tag`, `status`, `from`, `to`, `authorId`, `page`, `perPage` |
| `POST`   | `/api/v1/posts`               | signed in                                       | 201 `PostDetail` (a draft)                                                                                 |
| `GET`    | `/api/v1/posts/{id}`          | none for published; author or admin otherwise   | 200 `PostDetail`                                                                                           |
| `PATCH`  | `/api/v1/posts/{id}`          | author or admin                                 | 200 `PostDetail` (`title`, `body`, `tags`; no status)                                                      |
| `DELETE` | `/api/v1/posts/{id}`          | author or admin                                 | 204, empty body                                                                                            |
| `GET`    | `/api/v1/posts/{id}/comments` | none for published; author or admin otherwise   | 200 `Comment[]`, oldest first                                                                              |
| `POST`   | `/api/v1/posts/{id}/comments` | signed in; post must be published               | 201 `Comment`                                                                                              |

Errors are `{ code, message, fieldErrors? }` with 401, 403, 404, 422 (validation, including a
non-JSON content type or malformed JSON) or 429. Status transitions (publish, archive) are
Server-Action-only.

**Errors.** The DAL throws `UnauthorizedError`, `ForbiddenError`, `NotFoundError` and
`ValidationError`. Actions turn them into `ActionResult` failures, the Route Handler into
401/403/404/422 JSON, and `loadPage` into a login redirect or `notFound()`.

**Presenters.** Types are the source of truth; presenters exist only for overrides. A presenter is
a plain function that spreads the DTO and replaces just the fields a view needs reshaped
(`presentUser` turns a bare `website` domain into a linkable URL). Apply it where the data is
consumed: directly in a Server Component or in a client view.

**Auth.** Better Auth with email + password, database sessions, and the `nextCookies` plugin. `role`
(`user` / `admin`) is an additional user field. `proxy.ts` redirects private routes to
`/login?next=...` when the session cookie is absent (unknown paths count as private); it only
checks cookie presence, so the `/login` and `/signup` pages redirect signed-in users themselves (a
stale cookie must not lock anyone out). The DAL does the real check on every read and write.

`/admin` (admins only; anyone else gets the not-found page, signed-out visitors go to login) lists
users with search and pagination and lets an admin change another user's role; the admin cannot
change their own. Its DAL functions call `requireAdmin()` themselves.

Better Auth's HTTP routes `/api/auth/sign-up/email`, `/api/auth/update-user`,
`/api/auth/delete-user`, `/api/auth/delete-user/callback`, `/api/auth/sign-in/email`,
`/api/auth/request-password-reset`, `/api/auth/send-verification-email`,
`/api/auth/change-password`, `/api/auth/change-email` and `/api/auth/verify-password` are disabled
(`disabledPaths`): they would bypass our validation, the password check or the per-account rate
limits (Better Auth's own limiter is per process and trusts a spoofable client address). Sign-up
goes through `signUpAction`, profile edits through `updateProfile`, account deletion through
`deleteAccountAction`, and sign-in, password reset, verification email, password change and email
change through their own actions. Auth and account actions are rate limited in
production (Redis-backed, so shared across instances; if Redis is down the attempt is allowed).

`/settings` is the account page: profile photo, profile (name, username, website), email change,
password change, active sessions (revoke one or all others) and account deletion. Changing the email
asks the current address to confirm, then verifies the new one; both mails go through the
`send-email` job, and both links only complete in a browser signed in to that account. Deleting an account removes its posts and sessions and queues its uploaded files
for deletion.

Sign-up sends a verification email and the login form links to a password reset, both through the
`send-email` job. Verification is soft: unverified users can sign in and see a banner with a Resend
button. Resetting a password signs out every session. Better Auth's `/verify-email` and
`/reset-password/:token` routes stay enabled because the email links use them.

**Google sign-in (optional).** With `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` both set, `/login`
and `/signup` show a "Continue with Google" button (`components/Auth/GoogleButton`); with neither set
the button is absent and nothing else changes. Setting only one fails at boot in production.

> **Not verified end to end:** the sign-in round trip with Google was never executed (it needs real
> credentials). What is tested, without network access: the provider turning on and off with the
> environment, the generated username, the environment pair rule, that the action redirects to
> Google's authorization URL with the right redirect URI, that the button shows only when enabled,
> and the settings page for an account without a password. Treat the first real sign-in as the test.

Setup:

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), configure the
   OAuth consent screen, then create an **OAuth client ID** of type "Web application".
2. Add the authorized redirect URI `<BETTER_AUTH_URL>/api/auth/callback/google`
   (`http://localhost:3000/api/auth/callback/google` in development; use your real origin in
   production, and add it again for every environment).
3. Put the client ID and secret in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
   (compose passes them through to the containers) and restart the web process.

How it behaves: `signInWithGoogleAction(nextPath)` asks Better Auth for the authorization URL and
redirects to it; Google returns to `/api/auth/callback/google` (enabled in Better Auth's router,
unlike the paths in `disabledPaths`), which signs the user in and sends them to `nextPath`. A new
Google user gets a username derived from the email's local part plus a random six-character suffix
(`deriveUsername` in `lib/username.ts`; they can change it in settings), and a verified email
because Google vouches for it. Account linking is Better Auth's default: a Google sign-in links to
the existing account with the same email only when Google reports the email as verified **and** the
existing account's email is verified too. A password account that never verified its email is not
linked and the sign-in fails; the user must verify first (the banner has a Resend button).

A Google-only account has no password. `/settings` detects that (`hasPassword()` in
`lib/data/users.ts`), hides the change-password form and the delete-account button, and points to
"Forgot password". That works: in the installed Better Auth (1.7.7) the reset-password flow creates
the missing `credential` account (`resetPassword` in `better-auth/dist/api/routes/password.mjs`), and
`requestPasswordReset` does not require one to exist. The reset also signs out every session, so the
user signs in again afterwards. This path was read in the library source, not run.

Sessions last 7 days and refresh only through Server Actions or the auth route (Server Components
cannot set cookies), so a user who only browses is signed out when the session expires.

**Posts: relations and workflow.** The posts example also shows the domain patterns an app needs:
a status workflow (`draft` → `published` → `archived`, defined once in `POST_STATUS_TRANSITIONS` and
enforced by `setPostStatus`), visibility that depends on the viewer (only published posts are public;
a draft or archived post is visible to its author and admins and is "not found" for everyone else),
nested comments (`Comment`, with per-viewer delete permission), tags as a many-to-many (`Tag` +
`PostTag`) written together with the post in one `db.$transaction`, and the viewer's own list at
`/posts/mine`. Because `commentCount` and `tags` live inside cached lists, every comment, tag and
status write invalidates the tags those entries were cached under. New posts start as drafts.

## Pattern index

Where to look to see each pattern done once, properly.

| Pattern                               | Where it is shown                                                                                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-rendered list with URL filters | `app/(site)/posts/ssr/page.tsx` + `view.tsx`; `hooks/useUrlState.ts`; `postsUrlQuery` in `lib/dto/posts.ts`; `components/Posts/Filters`                                                 |
| Client-fetched list                   | `app/(site)/posts/csr/page.tsx` + `view.tsx`; facade `lib/client/posts.ts`; handler `app/api/v1/posts/route.ts`                                                                         |
| Create / edit form with field errors  | `components/Posts/Form/index.tsx` (+ `utils.ts`); `lib/formErrors.ts` (`applyActionErrors`); `actions/posts.ts`; pages `app/(site)/posts/new` and `app/(site)/posts/[userId]/[id]/edit` |
| Controlled form field                 | `components/Form/TagsInput/index.tsx`, wired through RHF's `Controller` in `components/Posts/Form/index.tsx`                                                                            |
| Nested resource (comments)            | `lib/data/comments.ts`; `actions/comments.ts`; `components/Comments/Thread`, `Form`, `DeleteButton`; `app/api/v1/posts/[id]/comments/route.ts`                                          |
| Many-to-many (tags)                   | `Tag` + `PostTag` in `prisma/schema.prisma`; `replacePostTags` and `listTags` in `lib/data/posts.ts`; `tagNameSchema` in `lib/dto/posts.ts`                                             |
| Multi-table transaction               | `createPost` / `updatePost` with `db.$transaction` and `replacePostTags` in `lib/data/posts.ts`                                                                                         |
| Status workflow                       | `POST_STATUS_TRANSITIONS` in `lib/dto/posts.ts`; `setPostStatus` in `lib/data/posts.ts`; `components/Posts/StatusActions`; `app/(site)/posts/mine`                                      |
| Viewer-dependent visibility           | `canViewPost`, `getPost` and `listPosts` in `lib/data/posts.ts` (cache the shared part, check the viewer after)                                                                         |
| Redis caching and invalidation        | `remember` / `invalidateTags` in `lib/server/cache.ts`; tags in `lib/data/cacheTags.ts`; used throughout `lib/data/posts.ts` and `lib/data/comments.ts`                                 |
| Multi-filter `where` builder          | `buildPostWhere` in `lib/data/posts.ts`; `listPostsQuery` in `lib/dto/posts.ts`                                                                                                         |
| REST CRUD handlers                    | `app/api/v1/posts/route.ts`, `app/api/v1/posts/[id]/route.ts`, `app/api/v1/posts/[id]/comments/route.ts`; `readJsonBody` and `toErrorResponse` in `lib/data/errors.ts`                  |
| Aggregates and raw SQL                | `lib/data/stats.ts` (`getSiteStats`, `getMyStats` with `groupBy`, `getPostsPerDay` with `$queryRaw`); `components/Stats/PostsPerDayChart`; page `app/(site)/dashboard`                  |
| File upload                           | `lib/data/uploads.ts`; `actions/uploads.ts`; `lib/server/storage.ts`; `lib/client/uploads.ts`; `components/Settings/AvatarUploader`                                                     |
| Background job and email              | `jobs/definitions.ts`, `jobs/sendEmail.ts`; `lib/server/queue.ts`; `worker/index.ts`; `lib/server/mailer.ts`; `emails/`                                                                 |
| Admin-only page                       | `app/(site)/admin/page.tsx` + `view.tsx`; `listUsers` / `setUserRole` with `requireAdmin()` in `lib/data/users.ts`                                                                      |
| OAuth (Google)                        | `lib/data/auth.ts` (`socialProviders`, `isGoogleAuthEnabled`); `signInWithGoogleAction` in `actions/auth.ts`; `lib/username.ts`; `components/Auth/GoogleButton`                         |

## Design decisions

- **One contract.** Three paths (Server Component, Server Action, client facade → Route Handler)
  end at the same DAL function and return the same DTO type under the same auth rules.
- **DAL and DTO boundary.** Prisma rows never leave `lib/data`; callers only see Zod-defined DTOs, and
  the DAL's `select` plus mapping make schema drift a compile error.
- **Auth in the DAL.** A page, action, or proxy that forgets a check cannot bypass authorization,
  because the data functions enforce it themselves.
- **Server Actions vs Route Handlers.** Actions for UI writes (no extra HTTP surface to design);
  a Route Handler where a client has to fetch or an HTTP API is required.
- **Typed errors per caller.** One set of error classes, translated once per transport.

## What I'd do at scale

- Declarative authorization policies instead of inline checks.
- ZenStack or Postgres row-level security as a second enforcement layer.
- Extend the existing lint rule to restrict `better-auth` imports as well.
- The rate limiter fails open when Redis is down; decide per action whether that is acceptable.
- A registry-published image and a deployment target (the Dockerfile and compose `app` profile cover running it locally).
- Cursor pagination (`CursorPage<T> = { items, nextCursor }`) for feeds.
- Generate OpenAPI from the Zod schemas if external API consumers appear.
- Everything the template deliberately leaves out is listed under "Deferred" in
  [`docs/DECISIONS.md`](docs/DECISIONS.md#deferred).

## Adding a resource

The posts domain is the worked example; copy its shape. In this order:

1. **Schema.** Add the model to `prisma/schema.prisma` (camelCase fields with snake_case `@map`s,
   an index on every foreign key you filter by, `onDelete: Cascade` where the child cannot outlive
   its parent), then `bun run db:migrate` and `bun run db:test:prepare`. Backfill existing rows in
   the migration SQL when a new column changes what old rows mean.
2. **DTOs** in `lib/dto/<name>.ts`: one input schema per write, one output schema per read shape
   (`...Summary` for lists, `...Detail` for one record), output dates with `z.coerce.date()`, list
   query schemas with every field bounded. A URL-facing twin (`xxxUrlQuery`) with `.catch()` on
   every field if the list keeps its filters in the query string.
3. **DAL** in `lib/data/<name>.ts`: `import 'server-only'`; per function: `requireUser()` /
   `requireAdmin()`, then `parseInput`, then existence, then permission; select exactly the DTO
   columns and map rows to DTOs; typed errors only. Use `db.$transaction` when one write touches
   several tables. Cache with `remember()` only the viewer-independent, bounded reads, and invalidate
   inside the write functions (new tags go in `lib/data/cacheTags.ts`). Test it first, in
   `tests/lib/data/<name>.test.ts`, per viewer (signed out, owner, other user, admin).
4. **Server Actions** in `actions/<name>.ts`: pass the arguments to the DAL untouched, then
   `revalidatePath` / `refresh`, return `ActionResult<T>` through `toActionFailure`. Add a Route
   Handler under `app/api/v1/<name>/` (thin: decode with the DTO schema, call the DAL, return JSON
   or `toErrorResponse`) only for an HTTP API or a client component that must fetch; the latter also
   gets a facade in `lib/client`.
5. **Pages and forms.** `page.tsx` is an async Server Component: await `params` / `searchParams`,
   load through `loadPage`, render. Add a `'use client'` `view.tsx` beside it only for what is
   interactive. Forms use React Hook Form with the DTO schema, start with the `'use client'` /
   `'use no memo'` header (copy `components/Settings/ProfileForm`) and map failures with
   `applyActionErrors`. Styles are an SCSS module with shadcn tokens.
6. **Routes and navigation.** Add the route constants to `lib/constants-routes.ts` and decide
   whether each route is public (`PUBLIC_ROUTES`) or private (the default); add the NavBar link.
7. **Only if a view needs reshaped fields**, add `presentX` in `presenters/<Name>Presenter.ts`.
8. **Seed and tests.** Extend `prisma/seed.ts`; add `tests/actions/<name>.test.ts`, component tests
   under `tests/components/`, and handler tests under `tests/app/api/v1/` when there is a handler.
   Tests that create rows through the DAL need the state they expect (the posts default is
   `draft`, so tests that want a public post set `status: 'published'`).

## More

- [`docs/DECISIONS.md`](docs/DECISIONS.md): what was chosen over the Nuxt/Revcube setup and why.
- [`AGENTS.md`](AGENTS.md): project conventions and rules for contributors and agents.
