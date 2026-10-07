// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import { deleteExpiredAuthRows, deleteStalePendingUploads } from '@/lib/data/maintenance'
import { deleteObject } from '@/lib/server/storage'
import { createUser, resetDatabase } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/server/storage', () => ({ deleteObject: vi.fn(async () => {}) }))

const hour = 60 * 60 * 1000

describe('maintenance DAL', () => {
  beforeEach(resetDatabase)
  afterAll(() => db.$disconnect())

  it('deletes only expired sessions and verifications', async () => {
    const user = await createUser({})
    await db.session.deleteMany()
    const session = (token: string, expiresAt: Date) =>
      db.session.create({ data: { id: token, token, userId: user.id, expiresAt } })
    await session('expired', new Date(Date.now() - hour))
    await session('live', new Date(Date.now() + hour))
    const verification = (id: string, expiresAt: Date) =>
      db.verification.create({ data: { id, identifier: id, value: 'v', expiresAt } })
    await verification('expired-a', new Date(Date.now() - hour))
    await verification('expired-b', new Date(Date.now() - 2 * hour))
    await verification('live', new Date(Date.now() + hour))

    expect(await deleteExpiredAuthRows()).toEqual({ sessions: 1, verifications: 2 })

    expect((await db.session.findMany()).map((row) => row.id)).toEqual(['live'])
    expect((await db.verification.findMany()).map((row) => row.id)).toEqual(['live'])
  })

  it('does nothing when nothing has expired', async () => {
    expect(await deleteExpiredAuthRows()).toEqual({ sessions: 0, verifications: 0 })
  })

  describe('deleteStalePendingUploads', () => {
    const upload = (key: string, userId: string, status: 'pending' | 'attached', ageMs: number) =>
      db.upload.create({
        data: {
          key,
          userId,
          purpose: 'avatar',
          contentType: 'image/png',
          size: 10,
          status,
          createdAt: new Date(Date.now() - ageMs),
        },
      })

    beforeEach(() => {
      vi.mocked(deleteObject).mockReset()
    })

    it('deletes pending uploads older than a day with their objects, and nothing else', async () => {
      const user = await createUser({})
      await upload('old-pending', user.id, 'pending', 25 * hour)
      await upload('fresh-pending', user.id, 'pending', 1 * hour)
      await upload('old-attached', user.id, 'attached', 48 * hour)

      expect(await deleteStalePendingUploads()).toEqual({ uploads: 1 })

      expect(deleteObject).toHaveBeenCalledTimes(1)
      expect(deleteObject).toHaveBeenCalledWith('old-pending')
      const keys = (await db.upload.findMany({ orderBy: { key: 'asc' } })).map((row) => row.key)
      expect(keys).toEqual(['fresh-pending', 'old-attached'])
    })

    it('handles at most one batch per run, oldest first, and the next run continues', async () => {
      const user = await createUser({})
      await upload('c-newest', user.id, 'pending', 26 * hour)
      await upload('a-oldest', user.id, 'pending', 30 * hour)
      await upload('b-middle', user.id, 'pending', 28 * hour)

      expect(await deleteStalePendingUploads(2)).toEqual({ uploads: 2 })
      expect((await db.upload.findMany()).map((row) => row.key)).toEqual(['c-newest'])
      expect(await deleteStalePendingUploads(2)).toEqual({ uploads: 1 })
      expect(await db.upload.count()).toBe(0)
    })

    it('keeps the row when the object cannot be deleted, and carries on', async () => {
      const user = await createUser({})
      await upload('a-broken', user.id, 'pending', 30 * hour)
      await upload('b-fine', user.id, 'pending', 30 * hour)
      vi.mocked(deleteObject).mockImplementation(async (key) => {
        if (key === 'a-broken') {
          throw new Error('storage down')
        }
      })

      expect(await deleteStalePendingUploads()).toEqual({ uploads: 1 })

      expect((await db.upload.findMany()).map((row) => row.key)).toEqual(['a-broken'])
    })
  })
})
