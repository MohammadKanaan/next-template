// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import {
  deleteExpiredAuthRows,
  deleteStalePendingUploads,
  purgeDeletedPosts,
} from '@/lib/data/maintenance'
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

    it('keeps deleting while batches come back full', async () => {
      const user = await createUser({})
      for (let i = 0; i < 5; i += 1) {
        await upload(`stale-${i}`, user.id, 'pending', 30 * hour)
      }

      expect(await deleteStalePendingUploads(2)).toEqual({ uploads: 5 })
      expect(await db.upload.count()).toBe(0)
    })

    it('stops after the maximum number of batches, oldest first', async () => {
      const user = await createUser({})
      for (let i = 0; i < 22; i += 1) {
        await upload(`k${String(i).padStart(2, '0')}`, user.id, 'pending', (60 - i) * hour)
      }

      expect(await deleteStalePendingUploads(1)).toEqual({ uploads: 20 })

      expect(vi.mocked(deleteObject).mock.calls.map(([key]) => key)).toEqual(
        Array.from({ length: 20 }, (_, i) => `k${String(i).padStart(2, '0')}`),
      )
      expect((await db.upload.findMany({ orderBy: { key: 'asc' } })).map((row) => row.key)).toEqual(
        ['k20', 'k21'],
      )
    })

    it('does not retry the same failing rows for every batch', async () => {
      const user = await createUser({})
      await upload('a-broken', user.id, 'pending', 30 * hour)
      await upload('b-broken', user.id, 'pending', 29 * hour)
      vi.mocked(deleteObject).mockRejectedValue(new Error('storage down'))

      expect(await deleteStalePendingUploads(2)).toEqual({ uploads: 0 })

      expect(deleteObject).toHaveBeenCalledTimes(2)
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

  describe('purgeDeletedPosts', () => {
    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * hour)

    it('removes only posts trashed before the cut-off, with their comments and tag links', async () => {
      const user = await createUser({})
      const post = (title: string, deletedAt: Date | null) =>
        db.post.create({ data: { userId: user.id, title, body: 'B', deletedAt } })
      const old = await post('old', daysAgo(31))
      await post('recent', daysAgo(29))
      await post('live', null)
      await db.comment.create({ data: { postId: old.id, userId: user.id, body: 'bye' } })
      const tag = await db.tag.create({ data: { name: 'x' } })
      await db.postTag.create({ data: { postId: old.id, tagId: tag.id } })

      expect(await purgeDeletedPosts({ olderThanDays: 30 })).toEqual({ posts: 1 })

      expect(
        (await db.post.findMany({ orderBy: { title: 'asc' } })).map((row) => row.title),
      ).toEqual(['live', 'recent'])
      expect(await db.comment.count()).toBe(0)
      expect(await db.postTag.count()).toBe(0)
    })

    it('works through several batches, oldest first', async () => {
      const user = await createUser({})
      for (let n = 1; n <= 5; n += 1) {
        await db.post.create({
          data: { userId: user.id, title: `p${n}`, body: 'B', deletedAt: daysAgo(40 + n) },
        })
      }
      expect(await purgeDeletedPosts({ olderThanDays: 30, batch: 2 })).toEqual({ posts: 5 })
      expect(await db.post.count()).toBe(0)
    })
  })
})
