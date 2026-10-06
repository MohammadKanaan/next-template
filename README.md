# Next Template

A reusable Next.js baseline: App Router, a server-only Data Access Layer on Prisma and PostgreSQL, Better
Auth, Server Actions for writes, shared Zod DTOs, schema-first forms, and shadcn/ui with SCSS everywhere else.

## Stack

- Next.js 16 (App Router, Turbopack), React 19 with the React Compiler, TypeScript 5.9
- Bun as the package manager (scripts run on Node 24)
- SCSS CSS Modules for all styling; shadcn/ui (Radix) + Tailwind CSS 4 only inside `components/SCN`
- lucide-react icons, sonner toasts
- Prisma ORM 7.10 (`prisma-client` generator, `@prisma/adapter-pg`) + PostgreSQL 18
- Better Auth 1.7 (email + password, official Prisma adapter)
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
bun run db:seed                   # 4 users, 16 posts
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
cp .env.example .env              # optional: set BETTER_AUTH_SECRET, RESEND_API_KEY, EMAIL_FROM
docker compose --profile app up --build
docker compose --profile app run --rm migrate bun run db:seed   # once, in a second terminal
```

Then open http://localhost:3000 (same seeded accounts as above) and check
`curl localhost:3000/api/health`.

`docker compose up -d` without the profile still starts only PostgreSQL, Redis and MinIO, which is what
`bun run dev` expects. The `app` profile adds three services built from one `Dockerfile`
(`node:24-slim` plus bun 1.3.10, because the scripts run on Node and bun only installs and launches
them):

| Service   | Command                                       | Notes                                                                    |
| --------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| `migrate` | `bun run db:deploy`, then `worker/migrate.ts` | One-shot: Prisma migrations, then the `pgboss` schema. Builds the image. |
| `web`     | `bun run start`                               | Port 3000; healthcheck on `/api/health`; waits for `migrate`.            |
| `worker`  | `bun run worker`                              | Background jobs; waits for `migrate`.                                    |

The containers get every variable the app validates at boot. Hosts are the compose service names
(`db`, `redis`, `minio`); `S3_PUBLIC_ENDPOINT=http://localhost:9000` is what the browser uses for
avatar uploads. Compose reads `.env` from the project directory for `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM` and the `NEXT_PUBLIC_*` build args, and falls back
to a local-only secret when they are unset. Every other container variable is fixed in
`docker-compose.yml`, so the `localhost` URLs in your `.env` never leak into the containers. Set a
real `BETTER_AUTH_SECRET` for anything beyond a local try-out. The containers run with
`NODE_ENV=production`, so without `RESEND_API_KEY` the email jobs fail and are retried (nothing is
logged); sign-in with the seeded accounts does not need email.

`NEXT_PUBLIC_*` values are baked into the bundle at build time (build args); everything else is read
at runtime. The seed replaces the seeded rows, so it is an explicit command and not part of
`migrate`; like `bun run db:seed` it does not flush Redis.

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
file straight to storage; attaching re-checks the object, updates `user.image`, and queues deletion
of the replaced avatar. Abandoned uploads are cleaned up hourly.

**Route Handler and facade.** `GET /api/v1/posts` exists only because a client component must fetch
(`/posts/csr`). `lib/client/posts.ts` calls it and parses the response with the shared schema.

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

Better Auth's HTTP routes `/api/auth/sign-up/email`, `/api/auth/update-user` and
`/api/auth/delete-user` are disabled (`disabledPaths`): they would bypass our validation or the
password check. Sign-up goes through `signUpAction`, profile edits through `updateProfile`, and
account deletion through `deleteAccountAction`. Auth and account actions are rate limited in
production (Redis-backed, so shared across instances; if Redis is down the attempt is allowed).

`/settings` is the account page: profile photo, profile (name, username, website), email change,
password change, active sessions (revoke one or all others) and account deletion. Changing the email
asks the current address to confirm, then verifies the new one; both mails go through the
`send-email` job. Deleting an account removes its posts and sessions and queues its uploaded files
for deletion.

Sign-up sends a verification email and the login form links to a password reset, both through the
`send-email` job. Verification is soft: unverified users can sign in and see a banner with a Resend
button. Resetting a password signs out every session. Better Auth's `/verify-email` and
`/reset-password/:token` routes stay enabled because the email links use them.

Sessions last 7 days and refresh only through Server Actions or the auth route (Server Components
cannot set cookies), so a user who only browses is signed out when the session expires.

## Design decisions

- **One contract.** Three paths (Server Component, Server Action, client facade → Route Handler)
  end at the same DAL function and return the same DTO type under the same auth rules.
- **DAL and DTO boundary.** Prisma rows never leave `lib/data`; callers only see Zod-defined DTOs, and
  the DAL's `select` plus mapping make schema drift a compile error.
- **Auth in the DAL.** A page, action, or proxy that forgets a check cannot bypass authorization,
  because the data functions enforce it themselves.
- **Server Actions vs Route Handlers.** Actions for UI writes (no extra HTTP surface to design);
  a Route Handler only where a client has to fetch.
- **Typed errors per caller.** One set of error classes, translated once per transport.

## What I'd do at scale

- Declarative authorization policies instead of inline checks.
- ZenStack or Postgres row-level security as a second enforcement layer.
- Extend the existing lint rule to restrict `better-auth` imports as well.
- The rate limiter fails open when Redis is down; decide per action whether that is acceptable.
- A registry-published image and a deployment target (the Dockerfile and compose `app` profile cover running it locally).
- Cursor pagination (`CursorPage<T> = { items, nextCursor }`) for feeds.
- Generate OpenAPI from the Zod schemas if external API consumers appear.

## Adding a resource

1. Add the model to `prisma/schema.prisma` (camelCase fields with snake_case `@map`s) and run
   `bun run db:migrate`.
2. Add the Zod schemas to `lib/dto/<name>.ts` (inputs and the output variants a view needs).
3. Add the DAL in `lib/data/<name>.ts`: `import 'server-only'`, select exactly the DTO columns, map
   rows to DTOs, call `requireUser()` / `requireAdmin()`, validate the input with `parseInput`,
   enforce record-level rules, throw typed errors.
4. Add Server Actions in `actions/<name>.ts` (DAL → `revalidatePath` → `ActionResult`). Add a Route Handler under `app/api/v1/<name>/` plus a facade in `lib/client`
   only if a client component must fetch.
5. Only if a view needs reshaped fields, add `presentX` in `presenters/<Name>Presenter.ts`.
6. Add the pages, the form component, and routes in `lib/constants-routes.ts` (decide whether
   they are public or private). `page.tsx` is an async Server Component that wraps its reads in
   `loadPage` and renders the markup; add a `'use client'` `view.tsx` beside it only for the
   interactive part (a form's submit handler, filters, pagination). Caching is optional: if a read
   is viewer independent and worth it, use `remember()` in the DAL and invalidate its tags in the
   writes.
7. Add tests in `tests/lib/data/`, `tests/actions/` (and `tests/app/` or `tests/lib/client/` for a
   handler) against the test DB.

## More

- [`docs/DECISIONS.md`](docs/DECISIONS.md): what was chosen over the Nuxt/Revcube setup and why.
- [`AGENTS.md`](AGENTS.md): project conventions and rules for contributors and agents.
