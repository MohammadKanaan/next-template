// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import { deleteExpiredAuthRows, deleteStalePendingUploads } from '@/lib/data/maintenance'
import { deleteObject } from '@/lib/server/storage'
import { createUser, resetDatabase } from '../../helpers/server'

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
    const day = 24 * hour
    beforeEach(() => {
      vi.mocked(deleteObject).mockReset().mockResolvedValue(undefined)
    })

    const upload = (userId: string, key: string, status: 'pending' | 'attached', createdAt: Date) =>
      db.upload.create({
        data: {
          userId,
          key,
          purpose: 'avatar',
          contentType: 'image/png',
          size: 1,
          status,
          createdAt,
        },
      })

    it('deletes pending uploads older than a day with their objects, oldest first', async () => {
      const user = await createUser({})
      await upload(user.id, 'stale-b', 'pending', new Date(Date.now() - day - hour))
      await upload(user.id, 'stale-a', 'pending', new Date(Date.now() - 2 * day))
      await upload(user.id, 'fresh', 'pending', new Date(Date.now() - hour))
      await upload(user.id, 'attached', 'attached', new Date(Date.now() - 2 * day))

      expect(await deleteStalePendingUploads()).toEqual({ uploads: 2 })

      expect(vi.mocked(deleteObject).mock.calls.map(([key]) => key)).toEqual(['stale-a', 'stale-b'])
      expect(
        (await db.upload.findMany({ select: { key: true }, orderBy: { key: 'asc' } })).map(
          (row) => row.key,
        ),
      ).toEqual(['attached', 'fresh'])
    })

    it('works through the backlog in batches', async () => {
      const user = await createUser({})
      for (let i = 0; i < 5; i += 1) {
        await upload(user.id, `stale-${i}`, 'pending', new Date(Date.now() - 2 * day))
      }
      expect(await deleteStalePendingUploads(2)).toEqual({ uploads: 5 })
      expect(await db.upload.count()).toBe(0)
    })

    it('keeps the row when the object could not be deleted, so the next run retries', async () => {
      const user = await createUser({})
      await upload(user.id, 'stuck', 'pending', new Date(Date.now() - 2 * day))
      await upload(user.id, 'fine', 'pending', new Date(Date.now() - 2 * day))
      vi.mocked(deleteObject).mockImplementation(async (key: string) => {
        if (key === 'stuck') {
          throw new Error('storage down')
        }
      })

      expect(await deleteStalePendingUploads()).toEqual({ uploads: 1 })
      expect((await db.upload.findMany({ select: { key: true } })).map((row) => row.key)).toEqual([
        'stuck',
      ])
    })

    it('stops when a whole batch fails instead of re-reading the same rows', async () => {
      const user = await createUser({})
      for (let i = 0; i < 3; i += 1) {
        await upload(user.id, `stuck-${i}`, 'pending', new Date(Date.now() - 2 * day))
      }
      vi.mocked(deleteObject).mockImplementation(async () => {
        throw new Error('storage down')
      })
      expect(await deleteStalePendingUploads(2)).toEqual({ uploads: 0 })
      expect(deleteObject).toHaveBeenCalledTimes(2)
      expect(await db.upload.count()).toBe(3)
    })
  })
})
