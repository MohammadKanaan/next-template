import { PgBoss } from 'pg-boss'
import { handleCleanup } from '@/jobs/cleanup'
import { getJobDefinition, jobs, type JobName, type JobPayload } from '@/jobs/definitions'
import { db } from '@/lib/data/db'

/**
 * Background worker: the one process that owns pg-boss (its `pgboss` schema migrations, queue
 * creation, supervision and cron). The web process only enqueues. Run with `bun run worker`.
 */

const SHUTDOWN_TIMEOUT_MS = 30_000

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('[worker] DATABASE_URL is required')
  process.exit(1)
}

const boss = new PgBoss({ connectionString })
boss.on('error', (error) => console.error('[worker] pg-boss error:', error))

/** Handlers receive job arrays; each job's payload is re-validated before the handler runs. */
async function register<N extends JobName>(
  name: N,
  handler: (payload: JobPayload<N>) => Promise<void>,
) {
  await boss.work(name, async (batch) => {
    for (const job of batch) {
      try {
        await handler(jobs[name].schema.parse(job.data) as JobPayload<N>)
      } catch (error) {
        console.error(`[worker] ${name} job ${job.id} failed:`, error)
        throw error
      }
    }
  })
}

async function start() {
  await boss.start()

  for (const name of Object.keys(jobs) as JobName[]) {
    const { options, cron } = getJobDefinition(name)
    // Definition changes (retries, expiry) must reach queues that already exist.
    if (await boss.getQueue(name)) {
      await boss.updateQueue(name, options)
    } else {
      await boss.createQueue(name, options)
    }
    if (cron) {
      await boss.schedule(name, cron, {})
    }
  }

  await register('cleanup', handleCleanup)

  console.log(`[worker] ready: ${Object.keys(jobs).join(', ')}`)
}

let shuttingDown = false

async function shutdown(signal: string) {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  console.log(`[worker] ${signal} received, finishing active jobs`)
  try {
    await boss.stop({ graceful: true, timeout: SHUTDOWN_TIMEOUT_MS })
    await db.$disconnect()
    process.exit(0)
  } catch (error) {
    console.error('[worker] shutdown failed:', error)
    process.exit(1)
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

start().catch((error) => {
  console.error('[worker] failed to start:', error)
  process.exit(1)
})
