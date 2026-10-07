import { PgBoss } from 'pg-boss'
import { handleCleanup } from '@/jobs/cleanup'
import { handleDeleteObject } from '@/jobs/deleteObject'
import { jobs, type JobDefinition, type JobName } from '@/jobs/definitions'
import { handleSendEmail } from '@/jobs/sendEmail'
import { db } from '@/lib/data/db'
import { serverEnv } from '@/lib/server/env'
import { logger } from '@/lib/server/logger'

// Background worker: the one process that owns pg-boss (its `pgboss` schema migrations, queue
// creation, supervision and cron). The web process only enqueues. Run with `bun run worker`.

const log = logger.child({ module: 'worker' })

const SHUTDOWN_TIMEOUT_MS = 30_000

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  log.fatal('DATABASE_URL is required')
  process.exit(1)
}

const boss = new PgBoss({ connectionString })
boss.on('error', (error) => log.error({ err: error }, 'pg-boss error'))

/** Handlers receive job arrays; each handler re-validates the payload it is given. */
const register = async (name: JobName, handler: (payload: unknown) => Promise<void>) => {
  await boss.work(name, async (batch) => {
    for (const job of batch) {
      try {
        await handler(job.data)
      } catch (error) {
        log.error({ err: error, job: name, jobId: job.id }, 'job failed')
        throw error
      }
    }
  })
}

const start = async () => {
  if (process.env.NODE_ENV === 'production') {
    // Fail at boot on a bad config instead of on the first job.
    serverEnv()
  }
  await boss.start()

  for (const name of Object.keys(jobs) as JobName[]) {
    // Widened to the common shape: only some definitions have a `cron`.
    const { options, cron }: JobDefinition = jobs[name]
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

  await register('send-email', handleSendEmail)
  await register('delete-object', handleDeleteObject)
  await register('cleanup', handleCleanup)

  log.info({ jobs: Object.keys(jobs) }, 'ready')
}

let shuttingDown = false

const shutdown = async (signal: string) => {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  log.info({ signal }, 'received signal, finishing active jobs')
  try {
    await boss.stop({ graceful: true, timeout: SHUTDOWN_TIMEOUT_MS })
    await db.$disconnect()
    process.exit(0)
  } catch (error) {
    log.error({ err: error }, 'shutdown failed')
    process.exit(1)
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

start().catch((error) => {
  log.fatal({ err: error }, 'failed to start')
  process.exit(1)
})
