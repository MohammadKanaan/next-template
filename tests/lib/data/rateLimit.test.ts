// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitedError } from '@/lib/data/errors'
import {
  consumeRateLimit,
  getClientIp,
  isRateLimitEnabled,
  resetRateLimits,
} from '@/lib/data/rateLimit'
import { getRedis } from '@/lib/server/redis'
import { resetRedis } from '../../helpers/server'

const headerValues = vi.hoisted(() => ({ current: new Headers() }))
vi.mock('next/headers', () => ({ headers: async () => headerValues.current }))

const rule = { max: 3, windowMs: 1000 }

async function consume(key: string, times: number) {
  for (let attempt = 0; attempt < times; attempt++) {
    await consumeRateLimit(key, rule)
  }
}

describe('consumeRateLimit', () => {
  beforeEach(resetRedis)
  afterAll(async () => {
    await resetRedis()
    await getRedis().quit()
  })

  it('allows max attempts and throws on the next one', async () => {
    await expect(consume('k', rule.max)).resolves.toBeUndefined()
    await expect(consumeRateLimit('k', rule)).rejects.toBeInstanceOf(RateLimitedError)
  })

  it('keeps counting inside the window instead of extending it', async () => {
    await consume('k', 2)
    const ttl = await getRedis().pttl('ratelimit:k')
    await consume('k', 1)
    expect(await getRedis().pttl('ratelimit:k')).toBeLessThanOrEqual(ttl)
  })

  it('resets after the window', async () => {
    await consume('k', rule.max)
    await expect(consumeRateLimit('k', rule)).rejects.toBeInstanceOf(RateLimitedError)
    await new Promise((resolve) => setTimeout(resolve, rule.windowMs + 50))
    await expect(consumeRateLimit('k', rule)).resolves.toBeUndefined()
  })

  it('keeps keys independent', async () => {
    await consume('a', rule.max)
    await expect(consumeRateLimit('a', rule)).rejects.toBeInstanceOf(RateLimitedError)
    await expect(consumeRateLimit('b', rule)).resolves.toBeUndefined()
  })

  it('shares counters across callers through Redis, and expires them there', async () => {
    await consume('shared', 1)
    expect(await getRedis().get('ratelimit:shared')).toBe('1')
    expect(await getRedis().pttl('ratelimit:shared')).toBeGreaterThan(0)
  })

  it('allows the attempt and logs when Redis is unavailable', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const multi = vi.spyOn(getRedis(), 'multi').mockImplementation(() => {
      throw new Error('redis down')
    })
    await expect(consumeRateLimit('k', rule)).resolves.toBeUndefined()
    expect(log).toHaveBeenCalled()
    multi.mockRestore()
    log.mockRestore()
  })

  it('resetRateLimits clears every counter', async () => {
    await consume('a', rule.max)
    await consume('b', rule.max)
    await resetRateLimits()
    await expect(consumeRateLimit('a', rule)).resolves.toBeUndefined()
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
