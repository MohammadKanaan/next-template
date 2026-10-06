// @vitest-environment node
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/health/route'
import { db } from '@/lib/data/db'
import { getRedis } from '@/lib/server/redis'
import { resetRedis } from '../../helpers/server'

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(async () => {}),
}))

describe('GET /api/health', () => {
  afterEach(() => vi.restoreAllMocks())
  afterAll(async () => {
    await resetRedis()
    await getRedis().quit()
    await db.$disconnect()
  })

  it('returns 200 when the database and Redis answer', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok', checks: { db: 'ok', redis: 'ok' } })
  })

  it('returns 503 when the database check fails, without leaking the error', async () => {
    vi.spyOn(db, '$queryRaw').mockRejectedValue(new Error('password authentication failed'))
    const response = await GET()
    expect(response.status).toBe(503)
    const text = JSON.stringify(await response.json())
    expect(JSON.parse(text)).toEqual({ status: 'degraded', checks: { db: 'fail', redis: 'ok' } })
    expect(text).not.toContain('password')
  })

  it('returns 503 when Redis does not answer', async () => {
    vi.spyOn(getRedis(), 'ping').mockRejectedValue(new Error('connection refused'))
    const response = await GET()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      status: 'degraded',
      checks: { db: 'ok', redis: 'fail' },
    })
  })

  it('treats a check that never settles as failed', async () => {
    vi.useFakeTimers()
    vi.spyOn(getRedis(), 'ping').mockReturnValue(new Promise(() => {}) as never)
    const pending = GET()
    await vi.advanceTimersByTimeAsync(2500)
    vi.useRealTimers()
    const response = await pending
    expect(response.status).toBe(503)
    expect((await response.json()).checks.redis).toBe('fail')
  })
})
