// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { invalidateTags, remember } from '@/lib/server/cache'
import { getRedis } from '@/lib/server/redis'
import { resetRedis } from '../../helpers/server'

const schema = z.object({ id: z.number(), createdAt: z.coerce.date() })
const createdAt = new Date('2026-01-02T03:04:05.000Z')
const options = { ttl: 60, tags: ['posts'], schema }

function counted(value = { id: 1, createdAt }) {
  return vi.fn(async () => value)
}

describe('remember', () => {
  beforeEach(resetRedis)
  afterEach(() => vi.restoreAllMocks())
  afterAll(async () => {
    await resetRedis()
    await getRedis().quit()
  })

  it('loads on a miss, then serves the hit without loading again', async () => {
    const load = counted()
    expect(await remember('k', options, load)).toEqual({ id: 1, createdAt })
    expect(await remember('k', options, load)).toEqual({ id: 1, createdAt })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('restores Dates through the schema on a hit', async () => {
    await remember('k', options, counted())
    const hit = await remember('k', options, counted())
    expect(hit.createdAt).toBeInstanceOf(Date)
    expect(hit.createdAt.toISOString()).toBe(createdAt.toISOString())
  })

  it('expires entries with the ttl', async () => {
    await remember('k', { ...options, ttl: 30 }, counted())
    const [key] = await getRedis().keys('cache:v:k|*')
    const ttl = await getRedis().ttl(key)
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(30)
  })

  it('keeps keys independent', async () => {
    const load = counted()
    await remember('a', options, load)
    await remember('b', options, load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('reloads after one of its tags is invalidated', async () => {
    const load = counted()
    await remember('k', { ...options, tags: ['posts', 'post:1'] }, load)
    await invalidateTags('post:1')
    await remember('k', { ...options, tags: ['posts', 'post:1'] }, load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('leaves entries under other tags alone', async () => {
    const load = counted()
    await remember('k', { ...options, tags: ['posts'] }, load)
    await invalidateTags('users')
    await remember('k', { ...options, tags: ['posts'] }, load)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('increments the tag version atomically for several tags', async () => {
    await invalidateTags('a', 'b')
    await invalidateTags('a')
    expect(await getRedis().mget('cache:tag:a', 'cache:tag:b')).toEqual(['2', '1'])
  })

  it('does not cache a load that throws', async () => {
    const failing = vi.fn(async () => {
      throw new Error('boom')
    })
    await expect(remember('k', options, failing)).rejects.toThrow('boom')
    const load = counted()
    await remember('k', options, load)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('falls through to load when Redis fails on read', async () => {
    vi.spyOn(getRedis(), 'mget').mockRejectedValue(new Error('redis down'))
    const load = counted()
    expect(await remember('k', options, load)).toEqual({ id: 1, createdAt })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('still returns the value when Redis fails on write', async () => {
    vi.spyOn(getRedis(), 'set').mockRejectedValue(new Error('redis down'))
    expect(await remember('k', options, counted())).toEqual({ id: 1, createdAt })
  })

  it('treats an entry that no longer matches the schema as a miss', async () => {
    await remember('k', options, counted())
    const [key] = await getRedis().keys('cache:v:k|*')
    await getRedis().set(key, '{"id":"not a number"}')
    const load = counted()
    expect(await remember('k', options, load)).toEqual({ id: 1, createdAt })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('does not throw when invalidation cannot reach Redis', async () => {
    vi.spyOn(getRedis(), 'multi').mockImplementation(() => {
      throw new Error('redis down')
    })
    await expect(invalidateTags('posts')).resolves.toBeUndefined()
  })
})
