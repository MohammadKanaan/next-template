# Jobs

Background work runs on pg-boss (the same PostgreSQL, `pgboss` schema) in a separate worker process.

- **Definitions** (`jobs/definitions.ts`): one entry per job with its name, Zod payload schema,
  queue `options` (retries, backoff, expiry) and an optional `cron`. Payload types come from
  `z.infer` (`JobPayload<'send-email'>`). Today: `send-email`, `delete-object`, `send-push`, `cleanup` (hourly). `delete-object` is also queued, delayed, when an
  account is deleted or an avatar replaced. `send-email` sets `deleteAfterSeconds: 3600`: its payloads carry live links
  that expire after an hour, so finished jobs must not keep them for pg-boss's 7-day default.
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
