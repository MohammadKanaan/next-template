// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { getRedis, getRedisSubscriber } from '@/lib/server/redis'

describe('redis clients', () => {
  afterAll(async () => {
    await getRedisSubscriber().quit()
    await getRedis().quit()
  })

  it('makes a SUBSCRIBE fail fast when Redis is down, without a command timeout', () => {
    const { maxRetriesPerRequest, commandTimeout } = getRedisSubscriber().options
    expect(maxRetriesPerRequest).toBe(1)
    expect(commandTimeout).toBeUndefined()
  })
})
