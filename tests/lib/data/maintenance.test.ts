// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import {
  deleteExpiredAuthRows,
  deleteStalePendingUploads,
  purgeDeletedPosts,
} from '@/lib/data/maintenance'
import { enqueue } from '@/lib/server/queue'
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
  afterEach(() => vi.restoreAllMocks())
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
    const upload = (
      key: string,
      userId: string,
      status: 'pending' | 'attached',
      ageMs: number,
      purpose: 'avatar' | 'attachment' = 'avatar',
    ) =>
      db.upload.create({
        data: {
          key,
          userId,
          purpose,
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

    it('reaps stale pending uploads of every purpose', async () => {
      const user = await createUser({})
      await upload('avatars/stale', user.id, 'pending', 25 * hour, 'avatar')
      await upload('attachments/stale', user.id, 'pending', 25 * hour, 'attachment')
      await upload('attachments/attached', user.id, 'attached', 48 * hour, 'attachment')

      expect(await deleteStalePendingUploads()).toEqual({ uploads: 2 })

      expect((await db.upload.findMany()).map((row) => row.key)).toEqual(['attachments/attached'])
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

    describe('attachments', () => {
      const attachTo = (postId: number, userId: string, key: string) =>
        db.upload.create({
          data: {
            key,
            userId,
            postId,
            purpose: 'attachment',
            name: 'f.pdf',
            contentType: 'application/pdf',
            size: 10,
            status: 'attached',
          },
        })
      const deleteJobs = () =>
        vi
          .mocked(enqueue)
          .mock.calls.filter(([name]) => name === 'delete-object')
          .map(([, payload]) => (payload as { key: string }).key)
          .sort()

      beforeEach(() => {
        vi.mocked(enqueue).mockReset()
      })

      it('queues a delete-object job for every attachment key and removes the rows', async () => {
        const author = await createUser({})
        const admin = await createUser({ role: 'admin' })
        const old = await db.post.create({
          data: { userId: author.id, title: 'old', body: 'B', deletedAt: daysAgo(40) },
        })
        const recent = await db.post.create({
          data: { userId: author.id, title: 'recent', body: 'B', deletedAt: daysAgo(5) },
        })
        const live = await db.post.create({ data: { userId: author.id, title: 'live', body: 'B' } })
        await attachTo(old.id, author.id, 'attachments/a/1')
        // Uploaded by someone else (an admin) onto the post: still goes.
        await attachTo(old.id, admin.id, 'attachments/b/2')
        await attachTo(recent.id, author.id, 'attachments/a/recent')
        await attachTo(live.id, author.id, 'attachments/a/live')

        expect(await purgeDeletedPosts({ olderThanDays: 30 })).toEqual({ posts: 1 })

        expect(deleteJobs()).toEqual(['attachments/a/1', 'attachments/b/2'])
        expect(
          (await db.upload.findMany({ orderBy: { key: 'asc' } })).map((row) => row.key),
        ).toEqual(['attachments/a/live', 'attachments/a/recent'])
      })

      it('deletes nothing when a job cannot be queued, so the next run retries', async () => {
        const author = await createUser({})
        const old = await db.post.create({
          data: { userId: author.id, title: 'old', body: 'B', deletedAt: daysAgo(40) },
        })
        await attachTo(old.id, author.id, 'attachments/a/1')
        vi.mocked(enqueue).mockRejectedValue(new Error('queue down'))

        await expect(purgeDeletedPosts({ olderThanDays: 30 })).rejects.toThrow('queue down')

        expect(await db.post.count()).toBe(1)
        expect(await db.upload.count()).toBe(1)
      })

      it('leaves a post alone that is restored after the batch was read, queueing nothing', async () => {
        const author = await createUser({})
        const old = await db.post.create({
          data: { userId: author.id, title: 'old', body: 'B', deletedAt: daysAgo(40) },
        })
        await attachTo(old.id, author.id, 'attachments/a/1')
        const findMany = db.post.findMany.bind(db.post)
        // The restore lands between the purge's read of the batch and its locked delete.
        vi.spyOn(db.post, 'findMany').mockImplementationOnce(((args: never) => {
          return findMany(args).then(async (rows) => {
            await db.post.update({ where: { id: old.id }, data: { deletedAt: null } })
            return rows
          })
        }) as never)

        expect(await purgeDeletedPosts({ olderThanDays: 30 })).toEqual({ posts: 0 })

        expect(deleteJobs()).toEqual([])
        expect(await db.post.count()).toBe(1)
        expect(await db.upload.count()).toBe(1)
      })
    })
  })
})
