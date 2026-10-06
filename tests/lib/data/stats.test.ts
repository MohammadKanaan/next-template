// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createComment } from '@/lib/data/comments'
import { db } from '@/lib/data/db'
import { UnauthorizedError, ValidationError } from '@/lib/data/errors'
import { createPost, setPostStatus } from '@/lib/data/posts'
import { getMyStats, getPostsPerDay, getSiteStats } from '@/lib/data/stats'
import { getRedis } from '@/lib/server/redis'
import { createUser, resetDatabase, signInAs, signOut } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

type Status = 'draft' | 'published' | 'archived'

const seedPost = (userId: string, status: Status, publishedAt: Date | null = null) => {
  return db.post.create({
    data: { userId, title: 'Post', body: 'Body', status, publishedAt },
  })
}

const seedComment = (postId: number, userId: string) => {
  return db.comment.create({ data: { postId, userId, body: 'Comment' } })
}

const daysAgo = (days: number, hour = 12) => {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  date.setUTCHours(hour, 0, 0, 0)
  return date
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10)

describe('stats DAL', () => {
  beforeEach(resetDatabase)
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

  describe('getSiteStats', () => {
    it('counts published posts, comments on them and the tags they use', async () => {
      const ann = await createUser({})
      const bob = await createUser({})
      const live = await seedPost(ann.id, 'published', daysAgo(1))
      await seedPost(bob.id, 'published', daysAgo(2))
      const draft = await seedPost(bob.id, 'draft')
      const archived = await seedPost(ann.id, 'archived', daysAgo(3))
      await seedComment(live.id, bob.id)
      await seedComment(live.id, ann.id)
      await seedComment(draft.id, ann.id)
      await seedComment(archived.id, bob.id)
      const [shared, onlyDraft] = await Promise.all([
        db.tag.create({ data: { name: 'shared' } }),
        db.tag.create({ data: { name: 'draft-only' } }),
        db.tag.create({ data: { name: 'unused' } }),
      ])
      await db.postTag.createMany({
        data: [
          { postId: live.id, tagId: shared.id },
          { postId: draft.id, tagId: shared.id },
          { postId: draft.id, tagId: onlyDraft.id },
        ],
      })

      // Public: no session needed.
      signOut()
      expect(await getSiteStats()).toEqual({ publishedPosts: 2, comments: 2, tags: 1 })
    })

    it('is all zeros on an empty site', async () => {
      expect(await getSiteStats()).toEqual({ publishedPosts: 0, comments: 0, tags: 0 })
    })
  })

  describe('getMyStats', () => {
    it('requires a session', async () => {
      signOut()
      await expect(getMyStats()).rejects.toBeInstanceOf(UnauthorizedError)
    })

    it('counts the viewer posts per status, every status present', async () => {
      const ann = await createUser({})
      const bob = await createUser({})
      await seedPost(ann.id, 'draft')
      await seedPost(ann.id, 'draft')
      await seedPost(ann.id, 'published', daysAgo(1))
      await seedPost(bob.id, 'archived', daysAgo(2))

      await signInAs(ann)
      expect((await getMyStats()).posts).toEqual({ draft: 2, published: 1, archived: 0 })
      await signInAs(bob)
      expect((await getMyStats()).posts).toEqual({ draft: 0, published: 0, archived: 1 })
    })

    it('counts only comments other people left on the viewer posts', async () => {
      const ann = await createUser({})
      const bob = await createUser({})
      const annPost = await seedPost(ann.id, 'published', daysAgo(1))
      const bobPost = await seedPost(bob.id, 'published', daysAgo(1))
      await seedComment(annPost.id, bob.id)
      await seedComment(annPost.id, bob.id)
      await seedComment(annPost.id, ann.id)
      await seedComment(bobPost.id, ann.id)

      await signInAs(ann)
      expect((await getMyStats()).commentsReceived).toBe(2)
      await signInAs(bob)
      expect((await getMyStats()).commentsReceived).toBe(1)
    })

    it('never serves one viewer the cached numbers of another', async () => {
      const ann = await createUser({})
      const bob = await createUser({})
      await seedPost(ann.id, 'draft')

      await signInAs(ann)
      expect((await getMyStats()).posts.draft).toBe(1)
      await signInAs(bob)
      expect((await getMyStats()).posts.draft).toBe(0)
      await signInAs(ann)
      expect((await getMyStats()).posts.draft).toBe(1)
    })
  })

  describe('getPostsPerDay', () => {
    it('zero-fills the window, oldest first, today last', async () => {
      const ann = await createUser({})
      await seedPost(ann.id, 'published', daysAgo(0, 0))
      await seedPost(ann.id, 'published', daysAgo(2, 23))
      await seedPost(ann.id, 'published', daysAgo(2, 1))
      // Not counted: another status, no date, outside the window.
      await seedPost(ann.id, 'draft', daysAgo(1))
      await seedPost(ann.id, 'archived', daysAgo(1))
      await seedPost(ann.id, 'published', daysAgo(10))

      const series = await getPostsPerDay(5)
      expect(series.map((day) => day.date)).toEqual([4, 3, 2, 1, 0].map((n) => isoDay(daysAgo(n))))
      expect(series.map((day) => day.count)).toEqual([0, 0, 2, 0, 1])
    })

    it('defaults to 30 days and accepts the bounds', async () => {
      expect(await getPostsPerDay()).toHaveLength(30)
      expect(await getPostsPerDay(1)).toEqual([{ date: isoDay(new Date()), count: 0 }])
      expect(await getPostsPerDay(90)).toHaveLength(90)
    })

    it('rejects days outside 1 to 90 or not a whole number', async () => {
      for (const days of [0, -1, 91, 1.5, Number.NaN]) {
        await expect(getPostsPerDay(days)).rejects.toBeInstanceOf(ValidationError)
      }
    })
  })

  describe('caching', () => {
    it('shows new numbers after a post or comment write', async () => {
      const ann = await createUser({})
      const bob = await createUser({})
      await signInAs(ann)
      expect(await getSiteStats()).toEqual({ publishedPosts: 0, comments: 0, tags: 0 })
      expect((await getMyStats()).posts.draft).toBe(0)
      expect((await getPostsPerDay(3)).map((day) => day.count)).toEqual([0, 0, 0])

      const post = await createPost({ title: 'Hello', body: 'World', tags: ['news'] })
      expect((await getMyStats()).posts).toEqual({ draft: 1, published: 0, archived: 0 })

      await setPostStatus(post.id, 'published')
      expect(await getSiteStats()).toEqual({ publishedPosts: 1, comments: 0, tags: 1 })
      expect((await getMyStats()).posts).toEqual({ draft: 0, published: 1, archived: 0 })
      expect((await getPostsPerDay(3)).map((day) => day.count)).toEqual([0, 0, 1])

      await signInAs(bob)
      await createComment(post.id, { body: 'Nice' })
      expect((await getSiteStats()).comments).toBe(1)
      await signInAs(ann)
      expect((await getMyStats()).commentsReceived).toBe(1)
    })
  })
})
