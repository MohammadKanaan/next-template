# Jobs

Background work runs on pg-boss (the same PostgreSQL, `pgboss` schema) in a separate worker process.
Today: `send-email` (every email Better Auth asks for) and the hourly `cleanup`.

- **Definitions** (`jobs/definitions.ts`): one entry per job with its name, Zod payload schema,
  queue `options` (retries, backoff, expiry) and an optional `cron`. Payload types come from
  `z.infer` (`JobPayload<'send-email'>`). `send-email` sets `deleteAfterSeconds: 3600`: its payloads
  carry live links that expire after an hour, so finished jobs must not keep them for pg-boss's
  7-day default. `cleanup` runs `0 * * * *` and deletes expired sessions and verification tokens.
- **Enqueue** (`lib/server/queue.ts`): `enqueue(name, payload, options?)` validates the payload with
  the job's schema and sends it through a lazily started send-only pg-boss instance
  (`migrate: false`, `supervise: false`, `schedule: false`). The web process never runs maintenance.
  Enqueue from the DAL or Better Auth callbacks (`queueEmail` in `lib/data/auth.ts`), not from
  components. Enqueue after a transaction commits, not inside it, and without awaiting where
  response time must not reveal whether an account exists.
- **Handlers** (`jobs/*.ts`): `handleXxx(payload: unknown)` re-parses the payload with the job's
  schema, then does the work; a thrown error fails the job and pg-boss retries it. `jobs/sendEmail.ts`
  also exports `renderEmail(payload)`, the template-to-mail mapping the test helpers reuse.
  Register each handler in `worker/index.ts`.
- **Worker** (`worker/index.ts`, `bun run worker`, or `dev:worker` to restart on changes): the only
  process that owns pg-boss. It runs the `pgboss` migrations, creates or updates each queue from its
  definition, schedules crons, runs the handlers, validates `serverEnv()` at boot in production,
  and drains on SIGTERM/SIGINT. It needs `DATABASE_URL` and the `lib/server` variables. Without it
  nothing queued ever runs: no verification or reset email is sent.
- It runs through `tsx --tsconfig worker/tsconfig.json`, which keeps the `@/` alias and maps
  `server-only` to an empty stub (`worker/serverOnly.ts`) so shared server code loads outside Next.
- **System DAL** (`lib/data/maintenance.ts`): job-only functions with no viewer, so no
  `requireUser()`. ESLint allows importing it from `jobs/**` (and tests) only. Anything a user can
  trigger belongs in a normal DAL file with auth.
- `worker/migrate.ts` installs the `pgboss` schema and exits; `db:test:prepare` runs it so the test
  database has the schema before `queue.test.ts` enqueues, and the compose `migrate` one-shot runs it
  after `db:deploy`.
- To add a job: definition → handler → register in `worker/index.ts` → tests in `tests/jobs/`.
  The global `tests/setup.ts` mocks `@/lib/server/queue`; only `queue.test.ts` uses the real one.
