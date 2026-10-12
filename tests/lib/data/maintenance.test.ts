// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/data/db'
import { deleteExpiredAuthRows } from '@/lib/data/maintenance'
import { createUser, resetDatabase } from '../../helpers/server'

const hour = 60 * 60 * 1000

describe('maintenance DAL', () => {
  beforeEach(resetDatabase)
  afterAll(() => db.$disconnect())

  it('deletes only expired sessions and verifications', async () => {
    const user = await createUser({})
    await db.session.deleteMany()
    const session = (token: string, expiresAt: Date) =>
      db.session.create({ data: { token, userId: user.id, expiresAt } })
    await session('expired', new Date(Date.now() - hour))
    await session('live', new Date(Date.now() + hour))
    const verification = (identifier: string, expiresAt: Date) =>
      db.verification.create({ data: { identifier, value: 'v', expiresAt } })
    await verification('expired-a', new Date(Date.now() - hour))
    await verification('expired-b', new Date(Date.now() - 2 * hour))
    await verification('live', new Date(Date.now() + hour))

    expect(await deleteExpiredAuthRows()).toEqual({ sessions: 1, verifications: 2 })

    expect((await db.session.findMany()).map((row) => row.token)).toEqual(['live'])
    expect((await db.verification.findMany()).map((row) => row.identifier)).toEqual(['live'])
  })

  it('does nothing when nothing has expired', async () => {
    expect(await deleteExpiredAuthRows()).toEqual({ sessions: 0, verifications: 0 })
  })
})
