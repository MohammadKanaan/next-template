import { deleteExpiredAuthRows, deleteStalePendingUploads } from '@/lib/data/maintenance'
import { logger } from '@/lib/server/logger'
import { jobs } from './definitions'

const log = logger.child({ module: 'cleanup' })

/** Hourly: drops expired sessions and verification tokens, and abandoned pending uploads. */
export const handleCleanup = async (payload: unknown) => {
  jobs.cleanup.schema.parse(payload)
  const deleted = await deleteExpiredAuthRows()
  const uploads = await deleteStalePendingUploads()
  log.info(
    {
      sessions: deleted.sessions,
      verifications: deleted.verifications,
      uploads: uploads.uploads,
    },
    'cleanup done',
  )
}
