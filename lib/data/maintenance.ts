import 'server-only'
import { deleteObject } from '@/lib/server/storage'
import { db } from './db'

/**
 * System DAL for background jobs. There is no viewer here, so these functions skip
 * `requireUser()`; that is why only `jobs/**` may import this file (enforced by ESLint).
 */

/** Deletes sessions and verification tokens past their expiry; returns how many of each. */
export async function deleteExpiredAuthRows() {
  const now = new Date()
  const [sessions, verifications] = await db.$transaction([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
  ])
  return { sessions: sessions.count, verifications: verifications.count }
}

const STALE_UPLOAD_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Deletes uploads still `pending` after a day (the browser never finished, or never called
 * attach) together with their objects. The object goes first, so if storage is down the row stays
 * and the next run retries it.
 */
export async function deleteStalePendingUploads(maxAgeMs = STALE_UPLOAD_AGE_MS) {
  const stale = await db.upload.findMany({
    where: { status: 'pending', createdAt: { lt: new Date(Date.now() - maxAgeMs) } },
    select: { id: true, key: true },
  })
  let deleted = 0
  for (const upload of stale) {
    try {
      await deleteObject(upload.key)
      await db.upload.delete({ where: { id: upload.id } })
      deleted += 1
    } catch (error) {
      console.error(`[cleanup] could not delete stale upload ${upload.id}:`, error)
    }
  }
  return { uploads: deleted }
}
