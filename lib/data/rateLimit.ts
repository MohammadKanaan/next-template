import 'server-only'
import { headers } from 'next/headers'
import { logger } from '@/lib/server/logger'
import { getRedis } from '@/lib/server/redis'
import { RateLimitedError } from './errors'

const log = logger.child({ module: 'rateLimit' })

export type RateLimitRule = { max: number; windowMs: number }

const KEY_PREFIX = 'ratelimit:'

/** Mirrors Better Auth's own default: its HTTP rate limiter is only on in production. */
export function isRateLimitEnabled() {
  return process.env.NODE_ENV === 'production'
}

/**
 * Fixed-window limiter shared by every instance through Redis. Counts one attempt for `key`;
 * throws `RateLimitedError` once more than `rule.max` attempts land in the current window. The
 * window starts at the first attempt (`PEXPIRE … NX` only sets the expiry on a fresh key), and
 * Redis drops the key when it ends. If Redis is unreachable the attempt is allowed and the failure
 * is logged: an outage must not lock everyone out of signing in.
 */
export async function consumeRateLimit(key: string, rule: RateLimitRule): Promise<void> {
  let count: number
  try {
    const results = await getRedis()
      .multi()
      .incr(KEY_PREFIX + key)
      .pexpire(KEY_PREFIX + key, rule.windowMs, 'NX')
      .exec()
    const incr = results?.[0]
    if (!incr || incr[0]) {
      throw incr?.[0] ?? new Error('Empty MULTI result')
    }
    count = Number(incr[1])
  } catch (error) {
    log.error({ err: error }, 'Redis unavailable, allowing the attempt')
    return
  }
  if (count > rule.max) {
    throw new RateLimitedError()
  }
}

/** Deletes every rate-limit counter; for tests. */
export async function resetRateLimits(): Promise<void> {
  const redis = getRedis()
  const keys = await redis.keys(`${KEY_PREFIX}*`)
  if (keys.length > 0) {
    await redis.del(...keys)
  }
}

/** First `x-forwarded-for` entry, else `x-real-ip`, else `'unknown'`. */
export async function getClientIp() {
  const requestHeaders = await headers()
  const forwarded = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || requestHeaders.get('x-real-ip')?.trim() || 'unknown'
}
