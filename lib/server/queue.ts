import 'server-only'
import { PgBoss, type SendOptions } from 'pg-boss'
import { jobs, type JobName, type JobPayload } from '@/jobs/definitions'

const globalForQueue = globalThis as unknown as { boss?: Promise<PgBoss> }

async function startBoss() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to enqueue jobs')
  }
  // Send-only: the worker owns the pgboss schema, queue creation, supervision and cron, so the web
  // process never runs maintenance and needs only a couple of connections.
  const boss = new PgBoss({
    connectionString,
    max: 3,
    migrate: false,
    supervise: false,
    schedule: false,
  })
  // Without a listener a connection error is an unhandled 'error' event and crashes the process.
  boss.on('error', (error) => console.error('[queue]', error))
  await boss.start()
  return boss
}

/** Shared send-only instance, started on first use so importing this file never needs a database. */
function getBoss() {
  if (!globalForQueue.boss) {
    const starting = startBoss()
    globalForQueue.boss = starting
    // A failed start (worker has not migrated yet, database down) must not stick for the process.
    starting.catch(() => {
      if (globalForQueue.boss === starting) {
        globalForQueue.boss = undefined
      }
    })
  }
  return globalForQueue.boss
}

/**
 * Validates `payload` against the job's schema and sends it to the queue (a worker runs it).
 * Returns the job id, or null when pg-boss dropped it (e.g. a singleton collision).
 */
export async function enqueue<N extends JobName>(
  name: N,
  payload: JobPayload<N>,
  options?: SendOptions,
): Promise<string | null> {
  const data = jobs[name].schema.parse(payload)
  const boss = await getBoss()
  return boss.send(name, data, options)
}

/** Stops the shared instance; for tests and graceful shutdown. */
export async function closeQueue(): Promise<void> {
  const starting = globalForQueue.boss
  globalForQueue.boss = undefined
  if (starting) {
    const boss = await starting.catch(() => null)
    await boss?.stop({ graceful: false })
  }
}
