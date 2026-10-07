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
/** Rows per run, so a big backlog cannot outlast the job's expiry; the next hourly run goes on. */
const STALE_UPLOAD_BATCH = 100

/**
 * Deletes uploads still `pending` after a day (the browser never finished, or never called
 * attach) together with their objects, oldest first and at most `batchSize` per run. The object
 * goes first, so if storage is down the row stays and the next run retries it.
 */
export const deleteStalePendingUploads = async (batchSize = STALE_UPLOAD_BATCH) => {
  const stale = await db.upload.findMany({
    where: { status: 'pending', createdAt: { lt: new Date(Date.now() - STALE_UPLOAD_AGE_MS) } },
    select: { id: true, key: true },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  })
  let deleted = 0
  for (const upload of stale) {
    try {
      await deleteObject(upload.key)
      await db.upload.delete({ where: { id: upload.id } })
      deleted += 1
    } catch (error) {
      log.error({ err: error, uploadId: upload.id }, 'could not delete stale upload')
    }
  }
  return { uploads: deleted }
}
