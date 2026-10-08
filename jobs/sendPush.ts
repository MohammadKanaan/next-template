import { deletePushSubscriptionByEndpoint, listPushSubscriptions } from '@/lib/data/maintenance'
import { logger } from '@/lib/server/logger'
import { PushGoneError, sendPush } from '@/lib/server/push'
import { jobs } from './definitions'

const log = logger.child({ module: 'sendPush' })

/**
 * Sends one notification to every browser subscription of a user. A subscription the push
 * service no longer knows is deleted; any other failure is rethrown after the loop so pg-boss
 * retries (a retry may reach the other subscriptions again, which is accepted).
 */
export const handleSendPush = async (payload: unknown) => {
  const { userId, title, body, url } = jobs['send-push'].schema.parse(payload)
  const targets = await listPushSubscriptions(userId)
  const results = await Promise.allSettled(
    targets.map((target) => sendPush(target, { title, body, url })),
  )
  let failure: unknown
  for (const result of results) {
    if (result.status !== 'rejected') {
      continue
    }
    if (result.reason instanceof PushGoneError) {
      await deletePushSubscriptionByEndpoint(result.reason.endpoint)
      log.info({ userId }, 'dropped an expired push subscription')
      continue
    }
    failure = result.reason
  }
  if (failure !== undefined) {
    throw failure
  }
}
