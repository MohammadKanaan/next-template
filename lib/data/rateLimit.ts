import 'server-only'
import { headers } from 'next/headers'
import { RateLimitedError } from './errors'

export type RateLimitRule = { max: number; windowMs: number }

type Bucket = { count: number; resetAt: number }

// Per-process memory: each instance counts on its own (see README, "What I'd do at scale").
const buckets = new Map<string, Bucket>()

/** Mirrors Better Auth's own default: its HTTP rate limiter is only on in production. */
export function isRateLimitEnabled() {
  return process.env.NODE_ENV === 'production'
}

/**
 * Fixed-window limiter. Counts one attempt for `key`; throws `RateLimitedError` once more than
 * `rule.max` attempts land in the current window. Expired buckets are pruned on every call, so the
 * map only holds keys that were active within the last window.
 */
export function consumeRateLimit(key: string, rule: RateLimitRule, now = Date.now()): void {
  for (const [bucketKey, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(bucketKey)
    }
  }

  const bucket = buckets.get(key)
  if (!bucket) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs })
    return
  }
  if (bucket.count >= rule.max) {
    throw new RateLimitedError()
  }
  bucket.count += 1
}

/** Number of live buckets; for tests. */
export function rateLimitBucketCount() {
  return buckets.size
}

/** Clears every bucket; for tests. */
export function resetRateLimits() {
  buckets.clear()
}

/** First `x-forwarded-for` entry, else `x-real-ip`, else `'unknown'`. */
export async function getClientIp() {
  const requestHeaders = await headers()
  const forwarded = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || requestHeaders.get('x-real-ip')?.trim() || 'unknown'
}
