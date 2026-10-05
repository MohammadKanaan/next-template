import { deleteExpiredAuthRows, deleteStalePendingUploads } from '@/lib/data/maintenance'
import { jobs } from './definitions'

/** Hourly: drops expired sessions and verification tokens, and abandoned pending uploads. */
export async function handleCleanup(payload: unknown) {
  jobs.cleanup.schema.parse(payload)
  const deleted = await deleteExpiredAuthRows()
  const uploads = await deleteStalePendingUploads()
  console.log(
    `[cleanup] deleted ${deleted.sessions} expired sessions, ${deleted.verifications} expired verifications, ${uploads.uploads} stale uploads`,
  )
}
