// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PUBLIC_API_LIMIT } from '@/lib/constants-rateLimit'
import { RateLimitedError } from '@/lib/data/errors'
import { consumePublicApiLimit, consumeRateLimit, getClientIp } from '@/lib/data/rateLimit'
import { resetServerEnv } from '@/lib/server/env'
import { getRedis } from '@/lib/server/redis'
import { resetRedis } from '../../helpers/server'

const headerValues = vi.hoisted(() => ({ current: new Headers() }))
vi.mock('next/headers', () => ({ headers: async () => headerValues.current }))
const log = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('@/lib/server/logger', () => ({ logger: { child: () => log } }))

const rule = { max: 3, windowMs: 1000 }

afterAll(async () => {
  await resetRedis()
  await getRedis().quit()
})

const consume = async (key: string, times: number) => {
  for (let attempt = 0; attempt < times; attempt++) {
    await consumeRateLimit(key, rule)
  }
}

describe('consumeRateLimit', () => {
  beforeEach(async () => {
    await resetRedis()
    vi.stubEnv('NODE_ENV', 'production')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })
  it('counts nothing outside production, like Better Auth’s own limiter', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    await expect(consume('k', rule.max + 1)).resolves.toBeUndefined()
    expect(await getRedis().get('ratelimit:k')).toBeNull()
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
    const multi = vi.spyOn(getRedis(), 'multi').mockImplementation(() => {
      throw new Error('redis down')
    })
    await expect(consumeRateLimit('k', rule)).resolves.toBeUndefined()
    expect(log.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Redis unavailable, allowing the attempt',
    )
    multi.mockRestore()
  })
})

describe('getClientIp', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('TRUSTED_PROXY_HOPS', '')
    resetServerEnv()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    resetServerEnv()
  })

  it('takes the entry TRUSTED_PROXY_HOPS from the end, one hop by default', async () => {
    headerValues.current = new Headers({ 'x-forwarded-for': 'a, b, c' })
    expect(await getClientIp()).toBe('c')

    vi.stubEnv('TRUSTED_PROXY_HOPS', '2')
    resetServerEnv()
    expect(await getClientIp()).toBe('b')
  })

  it('ignores TRUSTED_PROXY_HOPS outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2')
    resetServerEnv()
    headerValues.current = new Headers({ 'x-forwarded-for': 'a, b, c' })
    expect(await getClientIp()).toBe('c')
  })

  it('falls back to x-real-ip, then unknown, when the chain is shorter than the hop count', async () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2')
    resetServerEnv()
    headerValues.current = new Headers({ 'x-forwarded-for': 'a', 'x-real-ip': '3.3.3.3' })
    expect(await getClientIp()).toBe('3.3.3.3')
    headerValues.current = new Headers({ 'x-forwarded-for': 'a' })
    expect(await getClientIp()).toBe('unknown')
  })

  it('prefers the last x-forwarded-for entry, then x-real-ip, then unknown', async () => {
    headerValues.current = new Headers({
      'x-forwarded-for': '1.1.1.1, 2.2.2.2',
      'x-real-ip': '3.3.3.3',
    })
    expect(await getClientIp()).toBe('2.2.2.2')
    headerValues.current = new Headers({ 'x-real-ip': '3.3.3.3' })
    expect(await getClientIp()).toBe('3.3.3.3')
    headerValues.current = new Headers()
    expect(await getClientIp()).toBe('unknown')
  })
})

describe('consumePublicApiLimit', () => {
  beforeEach(async () => {
    await resetRedis()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('TRUSTED_PROXY_HOPS', '')
    resetServerEnv()
    headerValues.current = new Headers({ 'x-forwarded-for': '9.9.9.9' })
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    resetServerEnv()
  })

  it('counts per endpoint and client address, and throws past the limit', async () => {
    await getRedis().set('ratelimit:api:posts:ip:9.9.9.9', PUBLIC_API_LIMIT.max - 1)
    await expect(consumePublicApiLimit('posts')).resolves.toBeUndefined()
    await expect(consumePublicApiLimit('posts')).rejects.toBeInstanceOf(RateLimitedError)

    await expect(consumePublicApiLimit('post')).resolves.toBeUndefined()
    headerValues.current = new Headers({ 'x-forwarded-for': '8.8.8.8' })
    await expect(consumePublicApiLimit('posts')).resolves.toBeUndefined()
  })
})
