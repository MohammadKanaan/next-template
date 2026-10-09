import 'server-only'
import { logger } from '@/lib/server/logger'
import { deleteObject } from '@/lib/server/storage'
import { db } from './db'

const log = logger.child({ module: 'maintenance' })

// System DAL for background jobs. There is no viewer here, so these functions skip
// `requireUser()`; that is why only `jobs/**` may import this file (enforced by ESLint).

/** Deletes sessions and verification tokens past their expiry; returns how many of each. */
export const deleteExpiredAuthRows = async () => {
  const now = new Date()
  const [sessions, verifications] = await db.$transaction([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
  ])
  return { sessions: sessions.count, verifications: verifications.count }
}

const STALE_UPLOAD_AGE_MS = 24 * 60 * 60 * 1000
/** Rows per batch. */
const STALE_UPLOAD_BATCH = 100
/** Batches per run, so a big backlog cannot outlast the job's expiry; the next hourly run goes on. */
const STALE_UPLOAD_MAX_BATCHES = 20

/**
 * Deletes uploads still `pending` after a day (the browser never finished, or never called
 * attach) together with their objects, oldest first. Each run works through batches of `batchSize`
 * while they come back full, at most `batchSize * STALE_UPLOAD_MAX_BATCHES` rows. The object goes
 * first, so if storage is down the row stays and the next run retries it.
 */
export const deleteStalePendingUploads = async (batchSize = STALE_UPLOAD_BATCH) => {
  let deleted = 0
  for (let batch = 0; batch < STALE_UPLOAD_MAX_BATCHES; batch += 1) {
    const stale = await db.upload.findMany({
      where: { status: 'pending', createdAt: { lt: new Date(Date.now() - STALE_UPLOAD_AGE_MS) } },
      select: { id: true, key: true },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    })
    let deletedInBatch = 0
    for (const upload of stale) {
      try {
        await deleteObject(upload.key)
        await db.upload.delete({ where: { id: upload.id } })
        deletedInBatch += 1
      } catch (error) {
        log.error({ err: error, uploadId: upload.id }, 'could not delete stale upload')
      }
    }
    deleted += deletedInBatch
    // A short batch means the backlog is drained; a batch that deleted nothing would only be
    // read again, so stop instead of retrying the same failing rows.
    if (stale.length < batchSize || deletedInBatch === 0) {
      break
    }
  }
  return { uploads: deleted }
}
