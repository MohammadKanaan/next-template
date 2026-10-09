# Background jobs

The template has no queue: the three auth emails are sent inline without awaiting. Add a queue when
work must **retry** (a third-party call that fails), **run later** (delete an object after a ticket
expires), **run on a schedule** (hourly cleanup) or is **too slow for a request** (a report, a bulk
import). The shape that worked was pg-boss on the existing PostgreSQL.

## Why pg-boss

No new infrastructure (it lives in a `pgboss` schema of the same database), transactional with the
data you already have, retries, backoff, delays and cron built in. BullMQ would add a second Redis
responsibility (and eviction risk: the compose Redis runs `volatile-lru`), and a hosted queue a
dependency. Neither is needed until throughput says so.

## Shape

- **Definitions** in `jobs/definitions.ts`: one entry per job with its name, Zod payload schema,
  queue options and an optional cron. Payload types come from `z.infer`.

  ```ts
  export const jobs = {
    'send-email': {
      schema: z.object({ to: z.email(), subject: z.string(), html: z.string(), text: z.string() }),
      options: {
        retryLimit: 5,
        retryDelay: 30,
        retryBackoff: true,
        expireInSeconds: 60,
        deleteAfterSeconds: 3600,
      },
    },
    cleanup: {
      schema: z.object({}),
      options: { retryLimit: 1, expireInSeconds: 300 },
      cron: '0 * * * *',
    },
  } satisfies Record<string, JobDefinition>
  ```

  A payload that carries a live link (a reset or verification email) must not sit in a completed
  job for pg-boss's 7-day default: set `deleteAfterSeconds`.

- **Enqueue** in `lib/server/queue.ts`: `enqueue(name, payload, options?)` validates the payload with
  the job's schema and sends it through a lazily started, **send-only** instance (`migrate: false`,
  `supervise: false`, `schedule: false`, a few connections). The web process never runs queue
  maintenance. Enqueue from the DAL or Better Auth callbacks, never from components, and never
  await it where response time must not reveal whether an account exists.
- **Handlers** in `jobs/<name>.ts`: `handleXxx(payload: unknown)` re-parses the payload with the
  job's schema, then does the work. A thrown error fails the job and pg-boss retries it.
- **Worker** in `worker/index.ts` (`bun run worker`, `tsx watch` in development): the one process
  that owns pg-boss. It runs the `pgboss` migrations, creates or updates each queue from its
  definition, schedules the crons, registers the handlers, validates `serverEnv()` at boot in
  production, and drains on SIGTERM / SIGINT. It runs through
  `tsx --tsconfig worker/tsconfig.json`, a tsconfig that keeps the `@/` alias and maps `server-only`
  to an empty stub so the shared server code loads outside Next. Do not run it with
  `--conditions=react-server`.
- **System DAL** (`lib/data/maintenance.ts`): job-only functions with no viewer, so no
  `requireUser()`. Fence it with an ESLint `no-restricted-imports` pattern that allows the import
  from `jobs/**` and tests only, so a page or action cannot reach an unauthenticated data function.
  Anything a user can trigger belongs in a normal DAL file with auth.
- **Jobs inside transactions:** the usual rule is to enqueue after the commit (a rolled-back write
  must not send its email). The one exception that was worth it: when the job deletes an object
  whose database row is about to go, enqueue inside the transaction, because after a crash between
  commit and enqueue nothing could find the object any more.

## Plumbing

- `package.json`: `worker` and `dev:worker` scripts; `db:test:prepare` also installs the `pgboss`
  schema into the test database (a tiny `worker/migrate.ts` that starts pg-boss and stops).
- `docker-compose.yml`: a `worker` service from the same image, `bun run worker`, same environment
  as `web`; the `migrate` one-shot runs the pgboss migration after `db:deploy`.
- CI: the `db:test:prepare` step covers it.
- Tests: mock `@/lib/server/queue` globally in `tests/setup.ts` (`enqueue: vi.fn()`), assert on its
  calls, and test handlers directly with a payload. Only the queue's own test loads the real module.
- README: without the worker running, nothing queued ever runs; say so next to `bun run dev`.

## From the history (`7bd01c5`)

- `lib/server/queue.ts`, `jobs/definitions.ts`, `jobs/sendEmail.ts`, `jobs/cleanup.ts`,
  `jobs/deleteObject.ts`, `worker/index.ts`, `worker/migrate.ts`, `worker/tsconfig.json`,
  `worker/serverOnly.ts`, `lib/data/maintenance.ts`, the `maintenanceImportPattern` in
  `eslint.config.mjs`, `docs/guides/jobs.md`.
- Tests: `tests/lib/server/queue.test.ts`, `tests/jobs/*.test.ts`, `tests/lib/data/maintenance.test.ts`.
