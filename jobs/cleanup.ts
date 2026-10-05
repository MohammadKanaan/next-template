import { deleteExpiredAuthRows } from '@/lib/data/maintenance'
import { jobs } from './definitions'

/** Hourly: drops expired sessions and verification tokens. */
export async function handleCleanup(payload: unknown) {
  jobs.cleanup.schema.parse(payload)
  const deleted = await deleteExpiredAuthRows()
  console.log(
    `[cleanup] deleted ${deleted.sessions} expired sessions, ${deleted.verifications} expired verifications`,
  )
}
