// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createComment, deleteComment, listComments } from '@/lib/data/comments'
import { db } from '@/lib/data/db'
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/data/errors'
import { getPost, listPosts, setPostStatus } from '@/lib/data/posts'
import { updateProfile } from '@/lib/data/users'
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

const seedPost = (userId: string, status: 'draft' | 'published' | 'archived' = 'published') => {
  return db.post.create({ data: { userId, title: 'Post', body: 'Body', status } })
}

describe('comments DAL', () => {
  beforeEach(resetDatabase)
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })
  afterEach(() => vi.restoreAllMocks())

  describe('createComment', () => {
    it('checks session, then input, then the post, then whether comments are open', async () => {
      const author = await createUser({})
      const commenter = await createUser({})
      const draft = await seedPost(author.id, 'draft')
      const archived = await seedPost(author.id, 'archived')

      signOut()
      await expect(createComment(999, { body: 'x' })).rejects.toBeInstanceOf(UnauthorizedError)
      await signInAs(commenter)
      await expect(createComment(999, { body: ' ' })).rejects.toBeInstanceOf(ValidationError)
      await expect(createComment(999, { body: 'x' })).rejects.toBeInstanceOf(NotFoundError)
      // A hidden post is not found, so its existence does not leak.
      await expect(createComment(draft.id, { body: 'x' })).rejects.toBeInstanceOf(NotFoundError)
      await expect(createComment(archived.id, { body: 'x' })).rejects.toBeInstanceOf(NotFoundError)
      // Someone who may see the post is told that comments are closed.
      await signInAs(author)
      await expect(createComment(draft.id, { body: 'x' })).rejects.toBeInstanceOf(ForbiddenError)
      await expect(createComment(archived.id, { body: 'x' })).rejects.toBeInstanceOf(ForbiddenError)
      expect(await db.comment.count()).toBe(0)
    })

    it('creates a trimmed comment as the viewer and reports what the viewer may do', async () => {
      const author = await createUser({})
      const commenter = await createUser({ name: 'Casey' })
      const post = await seedPost(author.id)
      await signInAs(commenter)
      const comment = await createComment(post.id, { body: '  Nice  ' })
      expect(comment).toMatchObject({
        body: 'Nice',
        author: { id: commenter.id, name: 'Casey' },
        permissions: { delete: true },
      })
      expect(comment.createdAt).toBeInstanceOf(Date)
      expect(await db.comment.count()).toBe(1)
    })

    it('bounds the body', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      await expect(createComment(post.id, { body: 'x'.repeat(1001) })).rejects.toBeInstanceOf(
        ValidationError,
      )
    })

    it('stops accepting comments once the post is archived, even if its detail is cached', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      await getPost(post.id)
      await setPostStatus(post.id, 'archived')
      await expect(createComment(post.id, { body: 'late' })).rejects.toBeInstanceOf(ForbiddenError)
    })
  })

  describe('listComments', () => {
    it('lists oldest first with the author and per-viewer delete permission', async () => {
      const author = await createUser({})
      const alice = await createUser({ name: 'Alice' })
      const bob = await createUser({ name: 'Bob' })
      const admin = await createUser({ role: 'admin' })
      const post = await seedPost(author.id)
      await signInAs(alice)
      await createComment(post.id, { body: 'First' })
      await signInAs(bob)
      await createComment(post.id, { body: 'Second' })

      const deletable = async () => (await listComments(post.id)).map((c) => c.permissions.delete)
      signOut()
      expect((await listComments(post.id)).map((comment) => comment.body)).toEqual([
        'First',
        'Second',
      ])
      expect(await deletable()).toEqual([false, false])
      await signInAs(alice)
      expect(await deletable()).toEqual([true, false])
      await signInAs(bob)
      expect(await deletable()).toEqual([false, true])
      // The post's author and admins may remove any comment.
      await signInAs(author)
      expect(await deletable()).toEqual([true, true])
      await signInAs(admin)
      expect(await deletable()).toEqual([true, true])
      expect((await listComments(post.id))[0].author).toMatchObject({ id: alice.id, name: 'Alice' })
    })

    it('treats a hidden or missing post like a missing one', async () => {
      const author = await createUser({})
      const other = await createUser({})
      const draft = await seedPost(author.id, 'draft')
      signOut()
      await expect(listComments(draft.id)).rejects.toBeInstanceOf(NotFoundError)
      await expect(listComments('abc')).rejects.toBeInstanceOf(NotFoundError)
      await expect(listComments(999)).rejects.toBeInstanceOf(NotFoundError)
      await signInAs(other)
      await expect(listComments(draft.id)).rejects.toBeInstanceOf(NotFoundError)
      await signInAs(author)
      expect(await listComments(draft.id)).toEqual([])
    })

    it('serves repeated reads from Redis and shares them between viewers', async () => {
      const author = await createUser({})
      const reader = await createUser({})
      const post = await seedPost(author.id)
      await db.comment.create({ data: { postId: post.id, userId: reader.id, body: 'Hi' } })
      const findMany = vi.spyOn(db.comment, 'findMany')
      signOut()
      await listComments(post.id)
      await signInAs(reader)
      await listComments(post.id)
      expect(findMany).toHaveBeenCalledTimes(1)
    })
  })

  describe('deleteComment', () => {
    it('checks session, then existence, then permission', async () => {
      const author = await createUser({})
      const commenter = await createUser({})
      const stranger = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(commenter)
      const comment = await createComment(post.id, { body: 'Mine' })

      signOut()
      await expect(deleteComment(comment.id)).rejects.toBeInstanceOf(UnauthorizedError)
      await signInAs(stranger)
      await expect(deleteComment(999)).rejects.toBeInstanceOf(NotFoundError)
      await expect(deleteComment(0)).rejects.toBeInstanceOf(ValidationError)
      await expect(deleteComment(comment.id)).rejects.toBeInstanceOf(ForbiddenError)
      expect(await db.comment.count()).toBe(1)
    })

    it.each(['commenter', 'postAuthor', 'admin'] as const)('lets the %s delete it', async (who) => {
      const postAuthor = await createUser({})
      const commenter = await createUser({})
      const admin = await createUser({ role: 'admin' })
      const post = await seedPost(postAuthor.id)
      await signInAs(commenter)
      const comment = await createComment(post.id, { body: 'Bye' })

      await signInAs({ commenter, postAuthor, admin }[who])
      await deleteComment(comment.id)
      expect(await db.comment.count()).toBe(0)
    })

    it('reports a comment that vanishes before the write as not found', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      const comment = await createComment(post.id, { body: 'Gone' })
      const vanished = await db.comment
        .delete({ where: { id: 999_999 } })
        .catch((error: unknown) => error)
      vi.spyOn(db.comment, 'delete').mockImplementation(() => Promise.reject(vanished) as never)
      await expect(deleteComment(comment.id)).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  describe('cache invalidation', () => {
    it('createComment refreshes the cached comments and the counts in lists and details', async () => {
      const author = await createUser({})
      const reader = await createUser({})
      const post = await seedPost(author.id)
      expect(await listComments(post.id)).toEqual([])
      expect((await listPosts({ page: 1, perPage: 10 })).items[0].commentCount).toBe(0)
      expect((await getPost(post.id)).commentCount).toBe(0)

      await signInAs(reader)
      await createComment(post.id, { body: 'Hi' })
      expect(await listComments(post.id)).toHaveLength(1)
      expect((await listPosts({ page: 1, perPage: 10 })).items[0].commentCount).toBe(1)
      expect((await getPost(post.id)).commentCount).toBe(1)
    })

    it('deleteComment refreshes them too', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      const comment = await createComment(post.id, { body: 'Hi' })
      expect(await listComments(post.id)).toHaveLength(1)
      expect((await getPost(post.id)).commentCount).toBe(1)
      expect((await listPosts({ page: 1, perPage: 10 })).items[0].commentCount).toBe(1)

      await deleteComment(comment.id)
      expect(await listComments(post.id)).toEqual([])
      expect((await getPost(post.id)).commentCount).toBe(0)
      expect((await listPosts({ page: 1, perPage: 10 })).items[0].commentCount).toBe(0)
    })

    it('a profile edit refreshes the commenter name in cached comments', async () => {
      const author = await createUser({})
      const commenter = await createUser({ name: 'Before', username: 'before_name' })
      const post = await seedPost(author.id)
      await db.comment.create({ data: { postId: post.id, userId: commenter.id, body: 'Hi' } })
      expect((await listComments(post.id))[0].author.name).toBe('Before')

      await signInAs(commenter)
      await updateProfile({ name: 'After', username: 'after_name' })
      expect((await listComments(post.id))[0].author.name).toBe('After')
    })

    it('deleting the post removes its comments and drops the cached ones', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      await createComment(post.id, { body: 'Hi' })
      await listComments(post.id)
      const { deletePost } = await import('@/lib/data/posts')
      await deletePost(post.id)
      expect(await db.comment.count()).toBe(0)
      await expect(listComments(post.id)).rejects.toBeInstanceOf(NotFoundError)
    })
  })
})
