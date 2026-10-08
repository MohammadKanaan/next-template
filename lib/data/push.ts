import 'server-only'
import {
  MAX_PUSH_SUBSCRIPTIONS_PER_USER,
  pushEndpointSchema,
  pushSubscriptionInput,
  type PushConfig,
  type PushSubscriptionInput,
} from '@/lib/dto/push'
import { getPushPublicKey } from '@/lib/server/push'
import { requireUser } from './auth'
import { db } from './db'
import { parseInput } from './errors'
import { consumeRateLimit } from './rateLimit'

/** Public: what the browser needs to subscribe, or null when Web Push is not configured. */
export const getPushConfig = (): PushConfig | null => {
  const publicKey = getPushPublicKey()
  return publicKey ? { publicKey } : null
}

/**
 * Stores the viewer's browser subscription. The endpoint is unique per browser profile, so a
 * second sign-in on the same browser re-owns the row instead of failing. Rate limited per user
 * because it creates rows, and capped at `MAX_PUSH_SUBSCRIPTIONS_PER_USER` rows (the oldest go),
 * because the worker sends to every row.
 */
export const savePushSubscription = async (input: PushSubscriptionInput): Promise<void> => {
  const viewer = await requireUser()
  await consumeRateLimit(`push-subscribe:user:${viewer.id}`, { max: 10, windowMs: 60_000 })
  const { endpoint, keys } = parseInput(pushSubscriptionInput, input)
  const data = { userId: viewer.id, p256dh: keys.p256dh, auth: keys.auth }
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, ...data },
    update: data,
  })
  const surplus = await db.pushSubscription.findMany({
    where: { userId: viewer.id },
    orderBy: { createdAt: 'desc' },
    skip: MAX_PUSH_SUBSCRIPTIONS_PER_USER,
    select: { id: true },
  })
  if (surplus.length > 0) {
    await db.pushSubscription.deleteMany({ where: { id: { in: surplus.map((row) => row.id) } } })
  }
}

/** Removes the viewer's own subscription for `endpoint`; a missing one is fine. */
export const deletePushSubscription = async (endpoint: string): Promise<void> => {
  const viewer = await requireUser()
  const value = parseInput(pushEndpointSchema, endpoint)
  await db.pushSubscription.deleteMany({ where: { endpoint: value, userId: viewer.id } })
}
