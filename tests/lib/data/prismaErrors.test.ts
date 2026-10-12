// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/data/db'
import { isForeignKeyViolation, isUniqueViolation } from '@/lib/data/prismaErrors'
import { getRedis } from '@/lib/server/redis'
import { createUser, MISSING_ID, resetDatabase } from '../../helpers/server'

const failureOf = (work: Promise<unknown>) =>
  work.then(
    () => null,
    (error: unknown) => error,
  )

describe('Prisma constraint violations', () => {
  beforeEach(resetDatabase)
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

  it('recognises a unique violation, by name when asked', async () => {
    const user = await createUser({})
    const other = await createUser({})
    const error = await failureOf(
      db.user.update({ where: { id: other.id }, data: { username: user.username } }),
    )
    expect(isUniqueViolation(error)).toBe(true)
    expect(isUniqueViolation(error, 'users_username_key')).toBe(true)
    expect(isUniqueViolation(error, 'users_email_key')).toBe(false)
    expect(isForeignKeyViolation(error)).toBe(false)
  })

  it('recognises a foreign key violation, by name when asked', async () => {
    const error = await failureOf(
      db.post.create({ data: { userId: MISSING_ID, title: 'T', body: 'B' } }),
    )
    expect(isForeignKeyViolation(error)).toBe(true)
    expect(isForeignKeyViolation(error, 'posts_user_id_fkey')).toBe(true)
    expect(isForeignKeyViolation(error, 'sessions_user_id_fkey')).toBe(false)
    expect(isUniqueViolation(error)).toBe(false)
  })

  it('is false for anything else', () => {
    for (const value of [new Error('boom'), null, undefined, 'P2002']) {
      expect(isUniqueViolation(value)).toBe(false)
      expect(isForeignKeyViolation(value)).toBe(false)
    }
  })
})
