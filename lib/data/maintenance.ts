import 'server-only'
import { db } from './db'

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
