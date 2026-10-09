# Infrastructure (`lib/server`)

- Server-only code that is not the database: `env.ts`, `redis.ts`, `cache.ts`, `queue.ts`,
  `mailer.ts`, `logger.ts`. Every file starts with `import 'server-only'`.
- **Only `lib/data` (including the Better Auth config), `jobs/`, `worker/` and tests import
  `@/lib/server/*`.** ESLint forbids it from `app/`, `actions/`, `components/`, `hooks/`,
  `presenters/`, `emails/` and `lib/dto`. A page or action that needs infrastructure asks the DAL.
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
  the CLI scripts `worker/migrate.ts` and `prisma/seed.ts` keep it.
- Singletons (the Prisma client, Redis, pg-boss) hang off `globalThis` and are created lazily, so
  importing a file never needs its environment variables.
- `docker-compose.yml` provides Postgres and Redis for development (`docker compose up -d`). Under
  `profiles: ['app']` it also builds the single `Dockerfile` (`node:24-slim` + bun 1.3.10, no
  `output: 'standalone'`) and runs `migrate` (one-shot: `db:deploy`, then the `pgboss` schema), `web`
  (`bun run start`, healthcheck on `/api/health`) and `worker` (`bun run worker`) from it. The image's `bun run build` and the CI build step get a
  build-only placeholder `BETTER_AUTH_SECRET` (inline on the command, never `ENV`), because the
  auth module refuses to load without one. CI is `.github/workflows/ci.yml` (Postgres 18 + Redis 7
  services, `.env.test` from the example, then format, lint, typecheck, test and build).
