# Getting started

Stack, setup, Docker, scripts, tests, and how to make the template your own. The README has the short version.

## Stack

- Next.js 16 (App Router, Turbopack), React 19 with the React Compiler, TypeScript 5.9
- Bun as the package manager; scripts run on Node 24
- SCSS CSS Modules everywhere, shadcn/ui on Base UI plus Tailwind CSS 4 inside `components/SCN`
- lucide-react icons, sonner toasts
- Prisma ORM 7.10 (`prisma-client` generator, `@prisma/adapter-pg`) on PostgreSQL 18
- Better Auth 1.7: email and password, optional Google sign-in, the admin plugin, the official
  Prisma adapter
- Redis for the data cache and the rate limits, pg-boss for jobs, Resend for email, Cloudflare R2
  for uploads (optional)
- Server Actions and Zod 4 DTOs, React Hook Form 7 with `@hookform/resolvers`
- Vitest, Testing Library, jsdom

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

Log in as `leanne@example.com`, or `admin@example.com` for the admin area. The password is
`password123` for both, and `/signup` creates an account.

The app needs two services: PostgreSQL 15 or newer (18 in `docker-compose.yml`) and Redis 7 or
newer. If you run them yourself, create the `next_template_dev` and `next_template_test` databases,
point `REDIS_URL` in `.env` at your Redis, and put the matching values in `.env.test`. Tests use
Redis database 15 and flush it. Redis 7 is a hard floor because the rate limiter uses
`PEXPIRE ... NX`. The compose Redis sets `maxmemory` with the `volatile-lru` policy; use the same
policy on a shared instance so only expiring keys can be evicted.

The worker is a second process (`bun run worker`, or `dev:worker` to restart on changes). Without
it, jobs pile up in the queue, no verification or reset email is sent, and the hourly cleanup does
not run. With no `RESEND_API_KEY`, the worker logs emails instead of sending them, so the
verification and reset links are right there in its output. That fallback is for development: under
`NODE_ENV=production` the send job fails and is retried until the key is set, and nothing is logged.

Uploads are optional and off by default. The profile photo on `/settings` lives on Cloudflare R2.
Set the five `R2_*` variables in `.env`, all or none; `docs/guides/uploads.md` walks through the
bucket, its public domain, the CORS rule and the API token. Without them the card is hidden and
everything else works.

`db:seed` and `db:reset` write straight to PostgreSQL and do not flush the Redis cache, so `/posts`
can show pre-reset data for up to 5 minutes. `redis-cli -n 0 flushdb` clears it.

Google sign-in is optional too: set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (both or neither)
and add the authorized redirect URI `<BETTER_AUTH_URL>/api/auth/callback/google` in the Google Cloud
Console. The round trip with Google needs real credentials and is not covered by tests.

## Making it yours

### Rename checklist

The name appears as `next_template` (database names), `next-template` (package and image) and
`Next Template` (display name). Change every one:

- `package.json` (`name`) and `docker-compose.yml` (the `next_template_dev` database in
  `DATABASE_URL`, `POSTGRES_DB` and the healthcheck, the `next-template-app` image on three services,
  the `EMAIL_FROM` and `NEXT_PUBLIC_APP_NAME` defaults)
- `.env.example`, `.env.test.example` and your own `.env` / `.env.test` (`DATABASE_URL`,
  `NEXT_PUBLIC_APP_NAME`, `EMAIL_FROM`)
- `.github/workflows/ci.yml` (`POSTGRES_DB` and the comment about `next_template_test`)
- `tests/helpers/server.ts`: `assertTestDatabase()` insists the test URL contains `next_template_test`,
  so change that string and its error message together with the database name
- `lib/env.ts` (the `appName` fallback), `app/(site)/ui-kit/` (the badge and the page description)
  and the heading of `AGENTS.md` and `README.md`
- `grep -rIni "next.template" . --exclude-dir=node_modules --exclude-dir=.git` finds the rest

### Removing the posts example

Once your first resource looks like posts, delete posts. `bun run typecheck` and `bun run lint` find
whatever this list misses.

- `actions/posts.ts`, `app/(site)/posts/**`, `app/api/v1/posts/**`, `components/Posts/**`
- `lib/dto/posts.ts`, `lib/data/posts.ts`, `lib/data/policies/posts.ts`, `lib/excerpt.ts`
- the `Post` model and the `posts` relation on `User` in `prisma/schema.prisma`, then
  `bun run db:migrate`
- `POSTS_TAG` and `postTag` in `lib/data/cacheTags.ts`, and their uses in `lib/data/users.ts` and
  `lib/data/auth.ts`
- the post routes in `lib/constants-routes.ts`, `components/Layout/NavBar`, `app/sitemap.ts` with
  `lib/data/sitemap.ts` and `lib/dto/sitemap.ts`, the posts in `lib/openapi.ts`,
  `lib/structuredData.ts` and `lib/seo.ts`, and the post counts and lists of the admin overview and
  user page (`lib/data/admin.ts`, `lib/dto/admin.ts`, `app/(admin)`)
- the posts in `prisma/seed.ts` and `posts` in `resetDatabase()` (`tests/helpers/server.ts`)
- the posts sections of `app/(site)/ui-kit/view.tsx`, the wording about posts in `/settings`, and the
  matching tests under `tests/`; `grep -rIli post . --exclude-dir=node_modules --exclude-dir=.git`
  finds the rest

## Docker

```bash
cp .env.example .env              # required: BETTER_AUTH_SECRET; optional: RESEND_API_KEY, EMAIL_FROM
docker compose --profile app up --build
docker compose --profile app run --rm -e ALLOW_SEED=1 migrate bun run db:seed   # once, in a second terminal
```

Then open http://localhost:3000 and check `curl localhost:3000/api/health`. `ALLOW_SEED=1` is
needed because the containers run with `NODE_ENV=production`, where the seed refuses to run by
default. It creates `admin@example.com` with the public password `password123`.

`docker compose up -d` without the profile starts only PostgreSQL and Redis, which is what
`bun run dev` expects. The `app` profile adds three services built from one `Dockerfile`
(`node:24-slim` plus bun 1.4.2):

| Service   | Command                                       | Notes                                                                     |
| --------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| `migrate` | `bun run db:deploy`, then `worker/migrate.ts` | One-shot: Prisma migrations, then the `pgboss` schema. Builds the image.  |
| `web`     | `bun run start`                               | Port 3000 on loopback, healthcheck on `/api/health`, waits for `migrate`. |
| `worker`  | `bun run worker`                              | Background jobs, waits for `migrate`.                                     |

Compose reads `.env` for `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, the five `R2_*` variables and the `NEXT_PUBLIC_*` build
args. Every other container variable is fixed in `docker-compose.yml`. `BETTER_AUTH_SECRET` is
required: compose refuses to start without it. Production boot (`instrumentation.ts`) also refuses a
missing, short or placeholder secret and a missing `BETTER_AUTH_URL`. `NEXT_PUBLIC_*` values are
baked into the bundle at build time, everything else is read at runtime.

Every per-IP rate limit (`getClientIp` in `lib/data/rateLimit.ts`) reads the client address from
`x-forwarded-for`, so behind a proxy set `TRUSTED_PROXY_HOPS` (default `1`) to the number of proxies
that append it. A CDN plus a load balancer is `2`. The compose `web` service has no proxy, so its
port binds to `127.0.0.1`.

The image build and the compose `app` profile have not been run end to end on the machine this was
written on (no Docker daemon there); `docker compose config` passes. Treat the first
`docker compose --profile app up --build` as the test.

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

Copy `.env.test.example` to `.env.test`, run `bun run db:test:prepare` once per schema change and
whenever the test DB may be dirty, then `bun run test`. Server tests call the DAL, Server Actions and
Route Handlers directly against `next_template_test` and Redis database 15, which is flushed between
tests, and never touch the dev database. The job queue is mocked, so no email leaves the machine.
Component, presenter and DTO tests need no database.

Run only the test files a change touches (`bun run test tests/lib/data/posts.test.ts`), not the whole
suite. `resetDatabase()` truncates the database `.env.test` points at and flushes its Redis, so two
checkouts or git worktrees that share one test database corrupt each other's runs whenever they test
at the same time. Give every checkout its own: a database name that still contains
`next_template_test` (for example `next_template_test_feature_x`; `assertTestDatabase()` insists on
the substring), created and prepared with `bun run db:test:prepare`, and, because `assertTestRedis()`
accepts only database 15, its own Redis instance (another port in `REDIS_URL`) or no concurrent test
runs.
