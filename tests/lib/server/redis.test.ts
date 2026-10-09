// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { getRedis } from '@/lib/server/redis'

describe('redis client', () => {
  afterAll(async () => {
    await getRedis().quit()
  })

  it('fails a command fast instead of queueing it behind a reconnect', () => {
    const { maxRetriesPerRequest, commandTimeout, lazyConnect } = getRedis().options
    expect(maxRetriesPerRequest).toBe(1)
    expect(commandTimeout).toBe(1000)
    expect(lazyConnect).toBe(true)
  })

  it('is one shared connection', () => {
    expect(getRedis()).toBe(getRedis())
  })
})
