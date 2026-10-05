// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/data/db'
import { resetDatabase } from '../../helpers/server'

describe('database client', () => {
  beforeEach(resetDatabase)
  afterAll(() => db.$disconnect())

  it('targets the test database', () => {
    expect(process.env.DATABASE_URL).toContain('next_template_test')
  })

  it('round-trips a user with Date timestamps and the default role', async () => {
    const user = await db.user.create({
      data: { id: 'u1', name: 'Test', email: 'test@example.com', username: 'test' },
    })
    expect(user.role).toBe('user')
    expect(user.createdAt).toBeInstanceOf(Date)
    expect(await db.user.count()).toBe(1)
  })
})
