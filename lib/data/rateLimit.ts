import 'server-only'
import { headers } from 'next/headers'
import { PUBLIC_API_LIMIT } from '@/lib/constants-rateLimit'
import { serverEnv } from '@/lib/server/env'
import { logger } from '@/lib/server/logger'
import { getRedis } from '@/lib/server/redis'
import { RateLimitedError } from './errors'

const log = logger.child({ module: 'rateLimit' })

export type RateLimitRule = { max: number; windowMs: number }

const KEY_PREFIX = 'ratelimit:'

/**
 * Fixed-window limiter shared by every instance through Redis. Counts one attempt for `key`;
 * throws `RateLimitedError` once more than `rule.max` attempts land in the current window. The
 * window starts at the first attempt (`PEXPIRE … NX` only sets the expiry on a fresh key), and
 * Redis drops the key when it ends. If Redis is unreachable the attempt is allowed and the failure
 * is logged: an outage must not lock everyone out of signing in. Outside production it counts
 * nothing, mirroring Better Auth's own HTTP limiter.
 */
export const consumeRateLimit = async (key: string, rule: RateLimitRule): Promise<void> => {
  if (process.env.NODE_ENV !== 'production') {
    return
  }
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

/**
 * The client address: the `x-forwarded-for` entry `TRUSTED_PROXY_HOPS` (default 1; always 1
 * outside production) from the end,
 * else `x-real-ip`, else `'unknown'`. Next exposes no socket address and only fills
 * `x-forwarded-for` when the client sent none, so the app must sit behind at least one proxy that
 * appends the client address; a directly exposed server cannot trust the header at all. Each
 * trusted proxy appends one entry, so the entry that many from the end is the one the outermost
 * trusted proxy saw. Every entry before it comes from the client: trusting the first would let
 * anyone mint a new "IP" per request, and counting too few hops would put every user in the bucket
 * of the proxy's own address.
 */
export const getClientIp = async () => {
  const requestHeaders = await headers()
  // The limiter counts nothing outside production, and a half-configured development environment
  // (no server variables yet) must not break sign-in, so `serverEnv()` is not read there.
  const hops = process.env.NODE_ENV === 'production' ? (serverEnv().TRUSTED_PROXY_HOPS ?? 1) : 1
  const entries = (requestHeaders.get('x-forwarded-for') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const forwarded = entries.length >= hops ? entries[entries.length - hops] : undefined
  return forwarded || requestHeaders.get('x-real-ip')?.trim() || 'unknown'
}

/**
 * Counts one request to a public `/api/v1` endpoint against the client address (429 past
 * `PUBLIC_API_LIMIT`). The reads behind them are public and run counted, searched queries, so the
 * scriptable HTTP surface is limited where it is reached; the pages call the same DAL functions
 * unlimited, and flooding those is the reverse proxy's to stop.
 */
export const consumePublicApiLimit = async (endpoint: string): Promise<void> => {
  await consumeRateLimit(`api:${endpoint}:ip:${await getClientIp()}`, PUBLIC_API_LIMIT)
}
