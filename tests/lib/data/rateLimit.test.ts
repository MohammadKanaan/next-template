// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitedError } from '@/lib/data/errors'
import {
  consumeRateLimit,
  getClientIp,
  isRateLimitEnabled,
  rateLimitBucketCount,
  resetRateLimits,
} from '@/lib/data/rateLimit'

const headerValues = vi.hoisted(() => ({ current: new Headers() }))
vi.mock('next/headers', () => ({ headers: async () => headerValues.current }))

const rule = { max: 3, windowMs: 1000 }

describe('consumeRateLimit', () => {
  beforeEach(resetRateLimits)

  it('allows max attempts and throws on the next one', () => {
    for (let attempt = 0; attempt < rule.max; attempt++) {
      expect(() => consumeRateLimit('k', rule, 0)).not.toThrow()
    }
    expect(() => consumeRateLimit('k', rule, 0)).toThrow(RateLimitedError)
  })

  it('resets after the window', () => {
    for (let attempt = 0; attempt < rule.max; attempt++) {
      consumeRateLimit('k', rule, 0)
    }
    expect(() => consumeRateLimit('k', rule, 999)).toThrow(RateLimitedError)
    expect(() => consumeRateLimit('k', rule, 1000)).not.toThrow()
  })

  it('keeps keys independent', () => {
    for (let attempt = 0; attempt < rule.max; attempt++) {
      consumeRateLimit('a', rule, 0)
    }
    expect(() => consumeRateLimit('a', rule, 0)).toThrow(RateLimitedError)
    expect(() => consumeRateLimit('b', rule, 0)).not.toThrow()
  })

  it('prunes expired buckets so the map cannot grow without bound', () => {
    for (let key = 0; key < 50; key++) {
      consumeRateLimit(`k${key}`, rule, 0)
    }
    expect(rateLimitBucketCount()).toBe(50)
    consumeRateLimit('fresh', rule, 5000)
    expect(rateLimitBucketCount()).toBe(1)
  })
})

describe('isRateLimitEnabled', () => {
  it('is on only in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(isRateLimitEnabled()).toBe(true)
    vi.stubEnv('NODE_ENV', 'test')
    expect(isRateLimitEnabled()).toBe(false)
    vi.unstubAllEnvs()
  })
})

describe('getClientIp', () => {
  it('prefers the first x-forwarded-for entry, then x-real-ip, then unknown', async () => {
    headerValues.current = new Headers({
      'x-forwarded-for': '1.1.1.1, 2.2.2.2',
      'x-real-ip': '3.3.3.3',
    })
    expect(await getClientIp()).toBe('1.1.1.1')
    headerValues.current = new Headers({ 'x-real-ip': '3.3.3.3' })
    expect(await getClientIp()).toBe('3.3.3.3')
    headerValues.current = new Headers()
    expect(await getClientIp()).toBe('unknown')
  })
})
