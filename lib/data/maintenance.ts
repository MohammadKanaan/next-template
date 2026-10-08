import 'server-only'
import { logger } from '@/lib/server/logger'
import type { PushTarget } from '@/lib/server/push'
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

/**
 * Batches per run, so a big backlog cannot outlast the job's expiry; the next hourly run goes on.
 */
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

const TRASH_RETENTION_DAYS = 30
const PURGE_BATCH = 20
/** Batches per run, so a big trash cannot outlast the job's expiry. */
const PURGE_MAX_BATCHES = 20

/**
 * Permanently deletes posts that have been in the trash for more than `olderThanDays` days, oldest
 * first, in batches of `batch`, at most `PURGE_MAX_BATCHES` per run (the next run goes on). Comments
 * and tag links cascade. Returns how many posts went.
 */
export const purgeDeletedPosts = async ({
  olderThanDays = TRASH_RETENTION_DAYS,
  batch = PURGE_BATCH,
}: { olderThanDays?: number; batch?: number } = {}) => {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)
  let purged = 0
  for (let round = 0; round < PURGE_MAX_BATCHES; round += 1) {
    const expired = await db.post.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      select: { id: true },
      orderBy: { deletedAt: 'asc' },
      take: batch,
    })
    if (expired.length === 0) {
      break
    }
    const result = await db.post.deleteMany({
      where: { id: { in: expired.map((post) => post.id) }, deletedAt: { not: null, lt: cutoff } },
    })
    purged += result.count
    if (expired.length < batch || result.count === 0) {
      break
    }
  }
  return { posts: purged }
}

/** A user's push targets, in the shape `web-push` takes. */
export const listPushSubscriptions = async (userId: string): Promise<PushTarget[]> => {
  const rows = await db.pushSubscription.findMany({
    where: { userId },
    select: { endpoint: true, p256dh: true, auth: true },
  })
  return rows.map((row) => ({
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  }))
}

/** Drops a subscription the push service reported gone (404 / 410). */
export const deletePushSubscriptionByEndpoint = async (endpoint: string): Promise<void> => {
  await db.pushSubscription.deleteMany({ where: { endpoint } })
}
