import {
  deleteExpiredAuthRows,
  deleteStalePendingUploads,
  purgeDeletedPosts,
} from '@/lib/data/maintenance'
import { logger } from '@/lib/server/logger'
import { jobs } from './definitions'

const log = logger.child({ module: 'cleanup' })

/**
 * Hourly: drops expired sessions and verification tokens, abandoned pending uploads and posts that
 * have been in the trash for 30 days.
 */
export const handleCleanup = async (payload: unknown) => {
  jobs.cleanup.schema.parse(payload)
  const deleted = await deleteExpiredAuthRows()
  const uploads = await deleteStalePendingUploads()
  const posts = await purgeDeletedPosts()
  log.info(
    {
      sessions: deleted.sessions,
      verifications: deleted.verifications,
      uploads: uploads.uploads,
      posts: posts.posts,
    },
    'cleanup done',
  )
}
