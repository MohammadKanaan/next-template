// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '@/server/db'

describe('database connection', () => {
  it('targets the test database', () => {
    expect(process.env.DATABASE_URL).toContain('next_template_test')
  })

  it('can query the users table', async () => {
    const { total } = await db.orm.public.User.aggregate((a) => ({ total: a.count() }))
    expect(total).toBeTypeOf('number')
  })

  afterAll(async () => {
    await db.close()
  })
})
