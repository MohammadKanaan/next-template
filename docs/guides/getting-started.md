# Getting started

The README has the quick start; this covers what it leaves out.

## Services

PostgreSQL 15 or newer (18 in `docker-compose.yml`) and Redis 7 or newer (the rate limiter uses
`PEXPIRE ... NX`). Running them yourself: create the `next_template_dev` and `next_template_test`
databases and point `.env` and `.env.test` at them and at your Redis. Use `maxmemory-policy
volatile-lru`, as compose does, so only expiring keys are ever evicted.

The worker (`bun run worker`, or `dev:worker` to restart on changes) runs the jobs: emails and the
hourly cleanup. Without `RESEND_API_KEY` it logs each email instead of sending it; under
`NODE_ENV=production` the send fails and retries until the key is set.

`db:seed` and `db:reset` do not flush Redis, so `/posts` can show old data for up to 5 minutes;
`redis-cli -n 0 flushdb` clears it.

## Optional features

- **Profile photo uploads:** set the five `R2_*` variables, all or none (`uploads.md`). Without them
  the settings card is hidden.
- **Google sign-in:** set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, both or neither, and add
  `<BETTER_AUTH_URL>/api/auth/callback/google` as an authorized redirect URI in the Google Cloud
  Console. No test covers the round trip with Google.

## Rename checklist

The name appears as `next_template` (databases), `next-template` (package and image) and
`Next Template` (display name):

- `package.json` (`name`); `docker-compose.yml` (the database in `DATABASE_URL`, `POSTGRES_DB` and
  the healthcheck, the `next-template-app` image on three services, the `EMAIL_FROM` and
  `NEXT_PUBLIC_APP_NAME` defaults)
- `.env.example`, `.env.test.example` and your own `.env` / `.env.test`
- `.github/workflows/ci.yml` (`POSTGRES_DB` and a comment)
- `tests/helpers/server.ts`: `assertTestDatabase()` requires `next_template_test` in the URL; change
  the string and its message with the database name
- `lib/env.ts` (the `appName` fallback), `app/(site)/ui-kit/`, and the headings of `AGENTS.md` and
  `README.md`
- `grep -rIni "next.template" . --exclude-dir=node_modules --exclude-dir=.git` finds the rest

## Removing the posts example

Do it once your first resource looks like posts; `bun run typecheck` and `bun run lint` catch what
this list misses.

- `actions/posts.ts`, `app/(site)/posts/**`, `app/api/v1/posts/**`, `components/Posts/**`
- `lib/dto/posts.ts`, `lib/data/posts.ts`, `lib/data/policies/posts.ts`, `lib/excerpt.ts`
- the `Post` model and the `posts` relation on `User` in `prisma/schema.prisma`, then
  `bun run db:migrate`
- `POSTS_TAG` and `postTag` in `lib/data/cacheTags.ts` and their uses in `lib/data/users.ts` and
  `lib/data/auth.ts`
- the post routes in `lib/constants-routes.ts` and `components/Layout/NavBar`; `app/sitemap.ts`
  with `lib/data/sitemap.ts` and `lib/dto/sitemap.ts`; the posts in `lib/openapi.ts`,
  `lib/structuredData.ts` and `lib/seo.ts`; the post counts and lists in the admin pages
  (`lib/data/admin.ts`, `lib/dto/admin.ts`, `app/(admin)`)
- the posts in `prisma/seed.ts` and in `resetDatabase()` (`tests/helpers/server.ts`)
- the posts sections of `app/(site)/ui-kit/view.tsx`, the wording about posts in `/settings`, and
  their tests; `grep -rIli post . --exclude-dir=node_modules --exclude-dir=.git` finds the rest

## Docker

```bash
cp .env.example .env              # required: BETTER_AUTH_SECRET
docker compose --profile app up --build
docker compose --profile app run --rm -e ALLOW_SEED=1 migrate bun run db:seed   # once
```

Then open http://localhost:3000, or `curl localhost:3000/api/health`. The containers run with
`NODE_ENV=production`, where the seed refuses to run without `ALLOW_SEED=1`.

Without `--profile app`, compose starts only PostgreSQL and Redis, which `bun run dev` expects. The
profile adds three services built from one `Dockerfile`: `migrate` (one-shot: Prisma migrations,
then the `pgboss` schema), `web` (port 3000 on loopback, healthcheck on `/api/health`) and `worker`.

Compose reads the secrets, `RESEND_API_KEY`, `EMAIL_FROM`, the Google pair, the `R2_*` variables and
the `NEXT_PUBLIC_*` build args from `.env`; everything else is fixed in `docker-compose.yml`.
`NEXT_PUBLIC_*` values are baked in at build time. Production boot refuses a missing, short or
placeholder `BETTER_AUTH_SECRET` and a missing `BETTER_AUTH_URL`.

Behind a proxy, set `TRUSTED_PROXY_HOPS` (default `1`) to the number of proxies that append to
`x-forwarded-for` (a CDN plus a load balancer is `2`); every per-IP rate limit depends on it.

The image and the `app` profile have not been run end to end yet (`docker compose config` passes),
so treat the first `up --build` as the test.

## Tests

Run `bun run db:test:prepare` once, again after every schema change, and whenever the test
database may be dirty. Then run only the test files a change touches:
`bun run test tests/lib/data/posts.test.ts`.

Server tests run against the database in `.env.test` and Redis database 15, and `resetDatabase()`
truncates and flushes both. Two checkouts or worktrees that share them corrupt each other's runs. So
give each checkout its own database whose name still contains `next_template_test` (for example
`next_template_test_feature_x`), and either its own Redis instance (another port in `REDIS_URL`;
`assertTestRedis()` accepts only database 15) or no concurrent runs.
