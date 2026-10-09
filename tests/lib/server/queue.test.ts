// @vitest-environment node
import { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertTestDatabase } from '../../helpers/server'

const { closeQueue, enqueue } =
  await vi.importActual<typeof import('@/lib/server/queue')>('@/lib/server/queue')

const payload = {
  template: 'verify-email',
  to: 'ada@example.com',
  props: { name: 'Ada', url: 'http://localhost:3000/verify?token=t' },
} as const

// The queue under test lives in the `pgboss` schema, which `bun run db:test:prepare` installs.
// Assertions read it back through a separate instance, the way the worker would.
let boss: PgBoss

describe('enqueue', () => {
  beforeAll(async () => {
    assertTestDatabase()
    boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      supervise: false,
      schedule: false,
    })
    await boss.start()
    await boss.createQueue('send-email')
  })
  beforeEach(() => boss.deleteAllJobs('send-email'))
  afterAll(async () => {
    await boss.deleteAllJobs('send-email')
    await boss.stop({ graceful: false })
    await closeQueue()
  })

  it('sends a validated payload to the job queue', async () => {
    const id = await enqueue('send-email', payload)
    expect(id).toEqual(expect.any(String))
    const jobs = await boss.fetch<typeof payload>('send-email')
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ id, data: payload })
  })

  it('rejects an invalid payload without sending anything', async () => {
    const invalid = { ...payload, to: 'not-an-email' }
    await expect(enqueue('send-email', invalid)).rejects.toThrow()
    expect(await boss.fetch('send-email')).toHaveLength(0)
  })

  it('passes send options through', async () => {
    await enqueue('send-email', payload, { startAfter: 3600 })
    expect(await boss.fetch('send-email')).toHaveLength(0)
    expect(await boss.findJobs('send-email', { queued: true })).toHaveLength(1)
  })
})
