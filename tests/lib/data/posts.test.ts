// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/data/errors'
import {
  createPost,
  deletePost,
  getPost,
  listPosts,
  listTags,
  setPostStatus,
  toExcerpt,
  updatePost,
} from '@/lib/data/posts'
import { POSTS_TAG } from '@/lib/data/cacheTags'
import { getRedis } from '@/lib/server/redis'
import { invalidateTags } from '@/lib/server/cache'
import { createUser, resetDatabase, signInAs, signOut } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

/** Posts are drafts by default; the tests that read them back as a visitor need them published. */
const seedPost = async (
  userId: string,
  title = 'Post',
  body = 'Body',
  status: 'draft' | 'published' | 'archived' = 'published',
) => {
  return db.post.create({ data: { userId, title, body, status } })
}

describe('posts DAL', () => {
  beforeEach(resetDatabase)
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })
  afterEach(() => vi.restoreAllMocks())

  it('lists newest first as a Page of summaries with an excerpt and author', async () => {
    const author = await createUser({ name: 'Leanne Graham' })
    for (const n of [1, 2, 3]) {
      await seedPost(author.id, `Post ${n}`, 'x'.repeat(200))
    }
    const page = await listPosts({ page: 1, perPage: 2 })
    expect(page).toMatchObject({ page: 1, perPage: 2, totalItems: 3, totalPages: 2 })
    expect(page.items.map((post) => post.title)).toEqual(['Post 3', 'Post 2'])
    expect(page.items[0].excerpt).toBe(`${'x'.repeat(160)}…`)
    expect(page.items[0].createdAt).toBeInstanceOf(Date)
    expect(page.items[0].author).toEqual({
      id: author.id,
      name: 'Leanne Graham',
      username: author.username,
      website: null,
    })
    expect(page.items[0]).not.toHaveProperty('body')
  })

  it('filters by author', async () => {
    const a = await createUser({})
    const b = await createUser({})
    await seedPost(a.id)
    await seedPost(b.id)
    const page = await listPosts({ page: 1, perPage: 10, authorId: b.id })
    expect(page.items.map((post) => post.author.id)).toEqual([b.id])
  })

  it('sorts oldest first when asked, newest first by default', async () => {
    const author = await createUser({})
    for (const n of [1, 2, 3]) {
      await seedPost(author.id, `Post ${n}`)
    }
    const titles = async (sort?: 'newest' | 'oldest') =>
      (await listPosts({ page: 1, perPage: 10, sort })).items.map((post) => post.title)
    expect(await titles('oldest')).toEqual(['Post 1', 'Post 2', 'Post 3'])
    expect(await titles('newest')).toEqual(['Post 3', 'Post 2', 'Post 1'])
    expect(await titles()).toEqual(['Post 3', 'Post 2', 'Post 1'])
  })

  it('does not serve one sort order from the other order cache entry', async () => {
    const author = await createUser({})
    await seedPost(author.id, 'First')
    await seedPost(author.id, 'Second')
    const newest = await listPosts({ page: 1, perPage: 10, sort: 'newest' })
    const oldest = await listPosts({ page: 1, perPage: 10, sort: 'oldest' })
    expect(newest.items.map((post) => post.title)).toEqual(['Second', 'First'])
    expect(oldest.items.map((post) => post.title)).toEqual(['First', 'Second'])
  })

  it('searches titles case-insensitively and counts only the matches', async () => {
    const author = await createUser({})
    await seedPost(author.id, 'Learning TypeScript')
    await seedPost(author.id, 'Cooking pasta')
    await seedPost(author.id, 'typescript tips')
    const page = await listPosts({ page: 1, perPage: 10, q: 'TYPESCRIPT' })
    expect(page.items.map((post) => post.title)).toEqual(['typescript tips', 'Learning TypeScript'])
    expect(page.totalItems).toBe(2)
  })

  it('treats LIKE wildcards in a search literally', async () => {
    const author = await createUser({})
    await seedPost(author.id, '100% done')
    await seedPost(author.id, 'Plain title')
    await seedPost(author.id, 'snake_case')
    await seedPost(author.id, 'snakeXcase')
    const percent = await listPosts({ page: 1, perPage: 10, q: '%' })
    expect(percent.items.map((post) => post.title)).toEqual(['100% done'])
    const underscore = await listPosts({ page: 1, perPage: 10, q: 'snake_case' })
    expect(underscore.items.map((post) => post.title)).toEqual(['snake_case'])
  })

  it('combines search with sort and author filter', async () => {
    const a = await createUser({})
    const b = await createUser({})
    await seedPost(a.id, 'alpha one')
    await seedPost(b.id, 'alpha two')
    await seedPost(a.id, 'alpha three')
    const page = await listPosts({
      page: 1,
      perPage: 10,
      q: 'alpha',
      authorId: a.id,
      sort: 'oldest',
    })
    expect(page.items.map((post) => post.title)).toEqual(['alpha one', 'alpha three'])
  })

  it('caches unfiltered lists but never a search', async () => {
    const author = await createUser({})
    await seedPost(author.id, 'Findable')
    await listPosts({ page: 1, perPage: 10, q: 'find' })
    expect(await getRedis().keys('cache:v:*')).toEqual([])

    await listPosts({ page: 1, perPage: 10 })
    expect(await getRedis().keys('cache:v:*')).toHaveLength(1)

    // A search sees a new post at once: nothing cached could hide it.
    await seedPost(author.id, 'Findable too')
    const page = await listPosts({ page: 1, perPage: 10, q: 'find' })
    expect(page.totalItems).toBe(2)
  })

  it('throws NotFoundError for a missing post', async () => {
    await expect(getPost(999)).rejects.toBeInstanceOf(NotFoundError)
  })

  describe('input validation', () => {
    it('accepts a route param as the id and treats a malformed one as not found', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id, 'By param')
      expect((await getPost(String(post.id))).title).toBe('By param')
      await expect(getPost('abc')).rejects.toBeInstanceOf(NotFoundError)
      await expect(getPost(-1)).rejects.toBeInstanceOf(NotFoundError)
    })

    it('validates a new post itself, so a caller that skips the schema cannot write bad data', async () => {
      await signInAs(await createUser({}))
      const error = await createPost({ title: ' ', body: 'x'.repeat(5001) }).catch((e) => e)
      expect(error).toBeInstanceOf(ValidationError)
      expect(error.fieldErrors).toEqual({
        title: ['Title is required'],
        body: ['Body must be 5000 characters or fewer'],
      })
      expect(await db.post.count()).toBe(0)
      expect((await createPost({ title: '  Trimmed  ', body: 'Body' })).title).toBe('Trimmed')
    })

    it('validates an update and its id', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      await expect(updatePost(post.id, {})).rejects.toBeInstanceOf(ValidationError)
      await expect(updatePost(post.id, { title: '' })).rejects.toBeInstanceOf(ValidationError)
      await expect(updatePost(0, { title: 'x' })).rejects.toBeInstanceOf(ValidationError)
      await expect(deletePost(1.5)).rejects.toBeInstanceOf(ValidationError)
    })

    it('checks the session before the input', async () => {
      await expect(createPost({ title: '', body: '' })).rejects.toBeInstanceOf(UnauthorizedError)
    })

    it('bounds list queries', async () => {
      await expect(listPosts({ page: 1, perPage: 101 })).rejects.toBeInstanceOf(ValidationError)
      await expect(listPosts({ page: 0, perPage: 10 })).rejects.toBeInstanceOf(ValidationError)
    })
  })

  it('computes permissions for anonymous, other, owner, and admin viewers', async () => {
    const owner = await createUser({})
    const other = await createUser({})
    const admin = await createUser({ role: 'admin' })
    const post = await seedPost(owner.id)

    signOut()
    expect((await getPost(post.id)).permissions).toEqual({ update: false, delete: false })
    await signInAs(other)
    expect((await getPost(post.id)).permissions).toEqual({ update: false, delete: false })
    await signInAs(owner)
    expect((await getPost(post.id)).permissions).toEqual({ update: true, delete: true })
    await signInAs(admin)
    expect((await getPost(post.id)).permissions).toEqual({ update: true, delete: true })
  })

  it('requires a session to create, and creates as the viewer', async () => {
    await expect(createPost({ title: 'T', body: 'B' })).rejects.toBeInstanceOf(UnauthorizedError)
    const user = await createUser({})
    await signInAs(user)
    const post = await createPost({ title: 'T', body: 'B' })
    expect(post).toMatchObject({
      title: 'T',
      author: { id: user.id },
      permissions: { update: true },
    })
  })

  it('checks session, then existence, then ownership on update', async () => {
    const owner = await createUser({})
    const intruder = await createUser({})
    const post = await seedPost(owner.id)

    signOut()
    await expect(updatePost(999, { title: 'x' })).rejects.toBeInstanceOf(UnauthorizedError)
    await signInAs(intruder)
    await expect(updatePost(999, { title: 'x' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(updatePost(post.id, { title: 'x' })).rejects.toBeInstanceOf(ForbiddenError)
    await signInAs(owner)
    expect(await updatePost(post.id, { title: 'Renamed' })).toMatchObject({
      title: 'Renamed',
      body: 'Body',
    })
  })

  it('lets an admin update and delete someone else’s post', async () => {
    const owner = await createUser({})
    const admin = await createUser({ role: 'admin' })
    const post = await seedPost(owner.id)
    await signInAs(admin)
    expect((await updatePost(post.id, { body: 'Moderated' })).body).toBe('Moderated')
    await deletePost(post.id)
    expect(await db.post.count()).toBe(0)
  })

  it('forbids a non-owner from deleting', async () => {
    const owner = await createUser({})
    const intruder = await createUser({})
    const post = await seedPost(owner.id)
    await signInAs(intruder)
    await expect(deletePost(post.id)).rejects.toBeInstanceOf(ForbiddenError)
    expect(await db.post.count()).toBe(1)
  })

  describe('cache invalidation', () => {
    it('serves repeated list and detail reads from Redis', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      const findMany = vi.spyOn(db.post, 'findMany')
      const findUnique = vi.spyOn(db.post, 'findUnique')
      await listPosts({ page: 1, perPage: 10 })
      await listPosts({ page: 1, perPage: 10 })
      await getPost(post.id)
      await getPost(post.id)
      expect(findMany).toHaveBeenCalledTimes(1)
      expect(findUnique).toHaveBeenCalledTimes(1)
    })

    it('keeps an author filter that spells "all" apart from the unfiltered list', async () => {
      const author = await createUser({})
      await seedPost(author.id, 'Visible')
      expect((await listPosts({ page: 1, perPage: 10, authorId: 'all' })).items).toEqual([])
      expect((await listPosts({ page: 1, perPage: 10 })).items.map((post) => post.title)).toEqual([
        'Visible',
      ])
    })

    it('createPost invalidates the cached list (the new draft stays out of it)', async () => {
      const author = await createUser({})
      await seedPost(author.id, 'Old')
      expect((await listPosts({ page: 1, perPage: 10 })).totalItems).toBe(1)
      await signInAs(author)
      await createPost({ title: 'New', body: 'B' })
      const findMany = vi.spyOn(db.post, 'findMany')
      const page = await listPosts({ page: 1, perPage: 10 })
      // The cached entry was dropped (a fresh query ran), and a draft is not public.
      expect(findMany).toHaveBeenCalledTimes(1)
      expect(page.items.map((post) => post.title)).toEqual(['Old'])
    })

    it('updatePost invalidates the cached list and detail', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id, 'Before')
      await listPosts({ page: 1, perPage: 10 })
      await getPost(post.id)
      await signInAs(author)
      await updatePost(post.id, { title: 'After' })
      expect((await listPosts({ page: 1, perPage: 10 })).items[0].title).toBe('After')
      expect((await getPost(post.id)).title).toBe('After')
    })

    it('deletePost invalidates the cached list and detail', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await listPosts({ page: 1, perPage: 10 })
      await getPost(post.id)
      await signInAs(author)
      await deletePost(post.id)
      expect((await listPosts({ page: 1, perPage: 10 })).items).toEqual([])
      await expect(getPost(post.id)).rejects.toBeInstanceOf(NotFoundError)
    })

    it('computes permissions per viewer from a detail cached by someone else', async () => {
      const owner = await createUser({})
      const other = await createUser({})
      const post = await seedPost(owner.id)
      await signInAs(owner)
      expect((await getPost(post.id)).permissions).toEqual({ update: true, delete: true })
      await signInAs(other)
      expect((await getPost(post.id)).permissions).toEqual({ update: false, delete: false })
      signOut()
      expect((await getPost(post.id)).permissions).toEqual({ update: false, delete: false })
    })

    it('does not cache a missing post', async () => {
      await expect(getPost(999)).rejects.toBeInstanceOf(NotFoundError)
      const author = await createUser({})
      await db.post.create({
        data: { id: 999, userId: author.id, title: 'Late', body: 'B', status: 'published' },
      })
      expect((await getPost(999)).title).toBe('Late')
    })
  })

  it('truncates long bodies and trims whitespace before the ellipsis', () => {
    expect(toExcerpt('short')).toBe('short')
    expect(toExcerpt('abc   def', 6)).toBe('abc…')
  })

  it('reports a post that vanishes between the access check and the write as not found', async () => {
    const owner = await createUser({})
    const post = await seedPost(owner.id)
    await signInAs(owner)
    // A genuine P2025 from Prisma: deleting a row that does not exist.
    const vanished = await db.post
      .delete({ where: { id: 999_999 } })
      .catch((error: unknown) => error)
    // `updatePost` writes inside a transaction, so that is where the failure surfaces.
    vi.spyOn(db, '$transaction').mockImplementation(() => Promise.reject(vanished) as never)
    vi.spyOn(db.post, 'delete').mockImplementation(() => Promise.reject(vanished) as never)
    await expect(updatePost(post.id, { title: 'x' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(deletePost(post.id)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('rethrows other database errors', async () => {
    const owner = await createUser({})
    const post = await seedPost(owner.id)
    await signInAs(owner)
    vi.spyOn(db.post, 'delete').mockImplementation(() => Promise.reject(new Error('boom')) as never)
    await expect(deletePost(post.id)).rejects.toThrow('boom')
  })

  describe('visibility', () => {
    it('shows a draft or archived post only to its author and admins', async () => {
      const owner = await createUser({})
      const other = await createUser({})
      const admin = await createUser({ role: 'admin' })
      const draft = await seedPost(owner.id, 'Draft', 'B', 'draft')
      const archived = await seedPost(owner.id, 'Archived', 'B', 'archived')
      const published = await seedPost(owner.id, 'Published')

      for (const hidden of [draft, archived]) {
        signOut()
        await expect(getPost(hidden.id)).rejects.toBeInstanceOf(NotFoundError)
        await signInAs(other)
        await expect(getPost(hidden.id)).rejects.toBeInstanceOf(NotFoundError)
        await signInAs(owner)
        expect((await getPost(hidden.id)).status).toBe(hidden.status)
        await signInAs(admin)
        expect((await getPost(hidden.id)).status).toBe(hidden.status)
      }
      signOut()
      expect((await getPost(published.id)).status).toBe('published')
    })

    it('answers a hidden post exactly like a missing one', async () => {
      const owner = await createUser({})
      const draft = await seedPost(owner.id, 'Draft', 'B', 'draft')
      signOut()
      const hidden = await getPost(draft.id).catch((error: unknown) => error)
      const missing = await getPost(draft.id + 100).catch((error: unknown) => error)
      expect(hidden).toBeInstanceOf(NotFoundError)
      expect((hidden as Error).message).toBe((missing as Error).message)
    })

    it('still applies the check when the detail was cached by someone who may see it', async () => {
      const owner = await createUser({})
      const other = await createUser({})
      const draft = await seedPost(owner.id, 'Draft', 'B', 'draft')
      await signInAs(owner)
      await getPost(draft.id)
      expect(await getRedis().keys(`cache:v:post:${draft.id}|*`)).toHaveLength(1)
      await signInAs(other)
      await expect(getPost(draft.id)).rejects.toBeInstanceOf(NotFoundError)
    })

    it('lists only published posts to visitors and other users', async () => {
      const owner = await createUser({})
      const other = await createUser({})
      await seedPost(owner.id, 'Draft', 'B', 'draft')
      await seedPost(owner.id, 'Archived', 'B', 'archived')
      await seedPost(owner.id, 'Published')
      const titles = async (authorId?: string) =>
        (await listPosts({ page: 1, perPage: 10, authorId })).items.map((post) => post.title)

      signOut()
      expect(await titles()).toEqual(['Published'])
      expect(await titles(owner.id)).toEqual(['Published'])
      await signInAs(other)
      expect(await titles()).toEqual(['Published'])
      expect(await titles(owner.id)).toEqual(['Published'])
    })

    it('lets an author list every status of their own posts, and an admin everything', async () => {
      const owner = await createUser({})
      const admin = await createUser({ role: 'admin' })
      await seedPost(owner.id, 'Draft', 'B', 'draft')
      await seedPost(owner.id, 'Archived', 'B', 'archived')
      await seedPost(owner.id, 'Published')
      const statuses = async (authorId?: string) =>
        (await listPosts({ page: 1, perPage: 10, authorId })).items.map((post) => post.status)

      await signInAs(owner)
      expect(await statuses(owner.id)).toEqual(['published', 'archived', 'draft'])
      // Without the author filter the author is just another reader.
      expect(await statuses()).toEqual(['published'])
      await signInAs(admin)
      expect(await statuses()).toEqual(['published', 'archived', 'draft'])
      expect(await statuses(owner.id)).toEqual(['published', 'archived', 'draft'])
    })

    it('never caches a list that depends on the viewer, and keeps the public one apart', async () => {
      const owner = await createUser({})
      await seedPost(owner.id, 'Draft', 'B', 'draft')
      await seedPost(owner.id, 'Published')
      await signInAs(owner)
      await listPosts({ page: 1, perPage: 10, authorId: owner.id })
      expect(await getRedis().keys('cache:v:*')).toEqual([])

      signOut()
      await listPosts({ page: 1, perPage: 10, authorId: owner.id })
      expect(await getRedis().keys('cache:v:*')).toHaveLength(1)
      // The cached public list is not served to the author.
      await signInAs(owner)
      expect((await listPosts({ page: 1, perPage: 10, authorId: owner.id })).totalItems).toBe(2)
    })

    it('counts only what the viewer may see', async () => {
      const owner = await createUser({})
      await seedPost(owner.id, 'Draft', 'B', 'draft')
      await seedPost(owner.id, 'Published')
      signOut()
      expect((await listPosts({ page: 1, perPage: 10 })).totalItems).toBe(1)
    })
  })

  describe('tags', () => {
    it('stores lowercased, trimmed, de-duplicated tags and returns them alphabetically', async () => {
      await signInAs(await createUser({}))
      const post = await createPost({ title: 'T', body: 'B', tags: [' Zeta ', 'ALPHA', 'alpha'] })
      expect(post.tags).toEqual(['alpha', 'zeta'])
      expect(await db.tag.findMany({ orderBy: { name: 'asc' } })).toMatchObject([
        { name: 'alpha' },
        { name: 'zeta' },
      ])
    })

    it('shares one tag row between posts', async () => {
      await signInAs(await createUser({}))
      await createPost({ title: 'One', body: 'B', tags: ['shared'] })
      await createPost({ title: 'Two', body: 'B', tags: ['Shared'] })
      expect(await db.tag.count()).toBe(1)
      expect(await db.postTag.count()).toBe(2)
    })

    it('creates a post without tags when none are given', async () => {
      await signInAs(await createUser({}))
      expect((await createPost({ title: 'T', body: 'B' })).tags).toEqual([])
    })

    it('rejects more than five tags and creates nothing', async () => {
      await signInAs(await createUser({}))
      const tags = ['a', 'b', 'c', 'd', 'e', 'f']
      const error = await createPost({ title: 'T', body: 'B', tags }).catch((e) => e)
      expect(error).toBeInstanceOf(ValidationError)
      expect(error.fieldErrors).toEqual({ tags: ['Use at most 5 tags'] })
      expect(await db.post.count()).toBe(0)
    })

    it('writes the post and its tags in one transaction: a failing tag leaves no post', async () => {
      await signInAs(await createUser({}))
      // Valid for the DTO, rejected by Postgres (a text value cannot hold a NUL byte).
      await expect(
        createPost({ title: 'T', body: 'B', tags: ['fine', 'bad\u0000tag'] }),
      ).rejects.toThrow()
      expect(await db.post.count()).toBe(0)
      expect(await db.tag.count()).toBe(0)
      expect(await db.postTag.count()).toBe(0)
    })

    it('replaces the tags on update, leaves them alone when omitted, and clears them with []', async () => {
      const author = await createUser({})
      await signInAs(author)
      const post = await createPost({ title: 'T', body: 'B', tags: ['one', 'two'] })

      expect((await updatePost(post.id, { tags: ['two', 'three'] })).tags).toEqual(['three', 'two'])
      expect((await updatePost(post.id, { title: 'Renamed' })).tags).toEqual(['three', 'two'])
      expect((await updatePost(post.id, { tags: [] })).tags).toEqual([])
      expect(await db.postTag.count()).toBe(0)
    })

    it('moves updatedAt when only the tags change', async () => {
      await signInAs(await createUser({}))
      const post = await createPost({ title: 'T', body: 'B' })
      await new Promise((resolve) => setTimeout(resolve, 15))
      const updated = await updatePost(post.id, { tags: ['new'] })
      expect(updated.updatedAt.getTime()).toBeGreaterThan(post.updatedAt.getTime())
    })

    it('rolls back an update whose tags fail', async () => {
      await signInAs(await createUser({}))
      const post = await createPost({ title: 'Before', body: 'B', tags: ['keep'] })
      await expect(
        updatePost(post.id, { title: 'After', tags: ['bad\u0000tag'] }),
      ).rejects.toThrow()
      expect((await getPost(post.id)).title).toBe('Before')
      expect((await getPost(post.id)).tags).toEqual(['keep'])
    })

    it('shows the tags in lists and invalidates cached lists and details when they change', async () => {
      const author = await createUser({})
      await signInAs(author)
      const post = await createPost({ title: 'T', body: 'B' })
      await setPostStatus(post.id, 'published')
      expect((await listPosts({ page: 1, perPage: 10 })).items[0].tags).toEqual([])
      await getPost(post.id)
      await updatePost(post.id, { tags: ['fresh'] })
      expect((await listPosts({ page: 1, perPage: 10 })).items[0].tags).toEqual(['fresh'])
      expect((await getPost(post.id)).tags).toEqual(['fresh'])
    })

    it('lists tags with their published-post counts, cached and refreshed on change', async () => {
      const author = await createUser({})
      await signInAs(author)
      const a = await createPost({ title: 'A', body: 'B', tags: ['news', 'tech'] })
      await createPost({ title: 'B', body: 'B', tags: ['news'] })
      // Drafts do not count: nothing is published yet.
      expect(await listTags()).toEqual([])

      await setPostStatus(a.id, 'published')
      expect(await listTags()).toEqual([
        { name: 'news', postCount: 1 },
        { name: 'tech', postCount: 1 },
      ])
      await setPostStatus(a.id, 'archived')
      expect(await listTags()).toEqual([])
    })

    it('serves the tag list from Redis', async () => {
      const author = await createUser({})
      await signInAs(author)
      const post = await createPost({ title: 'A', body: 'B', tags: ['news'] })
      await setPostStatus(post.id, 'published')
      const findMany = vi.spyOn(db.tag, 'findMany')
      await listTags()
      await listTags()
      expect(findMany).toHaveBeenCalledTimes(1)
    })
  })

  describe('status workflow', () => {
    it('starts every new post as a draft', async () => {
      await signInAs(await createUser({}))
      const post = await createPost({ title: 'T', body: 'B' })
      expect(post).toMatchObject({ status: 'draft', publishedAt: null })
    })

    it('walks the allowed transitions and stamps publishedAt on the first publication only', async () => {
      await signInAs(await createUser({}))
      const post = await createPost({ title: 'T', body: 'B' })

      const published = await setPostStatus(post.id, 'published')
      expect(published.status).toBe('published')
      expect(published.publishedAt).toBeInstanceOf(Date)
      const firstPublishedAt = published.publishedAt

      expect((await setPostStatus(post.id, 'draft')).publishedAt).toEqual(firstPublishedAt)
      expect((await setPostStatus(post.id, 'published')).publishedAt).toEqual(firstPublishedAt)
      expect((await setPostStatus(post.id, 'archived')).status).toBe('archived')
      expect((await setPostStatus(post.id, 'published')).publishedAt).toEqual(firstPublishedAt)
    })

    it.each([
      ['draft', 'archived'],
      ['draft', 'draft'],
      ['published', 'published'],
      ['archived', 'draft'],
      ['archived', 'archived'],
    ] as const)('refuses %s -> %s with a field error on status', async (from, to) => {
      const author = await createUser({})
      const post = await seedPost(author.id, 'T', 'B', from)
      await signInAs(author)
      const error = await setPostStatus(post.id, to).catch((e) => e)
      expect(error).toBeInstanceOf(ValidationError)
      expect(error.fieldErrors.status).toHaveLength(1)
      expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe(from)
    })

    it('checks session, then existence, then permission, then the transition', async () => {
      const owner = await createUser({})
      const intruder = await createUser({})
      const admin = await createUser({ role: 'admin' })
      const post = await seedPost(owner.id, 'T', 'B', 'draft')

      signOut()
      await expect(setPostStatus(999, 'published')).rejects.toBeInstanceOf(UnauthorizedError)
      await signInAs(intruder)
      await expect(setPostStatus(999, 'published')).rejects.toBeInstanceOf(NotFoundError)
      await expect(setPostStatus(post.id, 'published')).rejects.toBeInstanceOf(ForbiddenError)
      // A forbidden viewer learns nothing about the transition rules.
      await expect(setPostStatus(post.id, 'archived')).rejects.toBeInstanceOf(ForbiddenError)
      await signInAs(admin)
      expect((await setPostStatus(post.id, 'published')).status).toBe('published')
    })

    it('validates its input', async () => {
      await signInAs(await createUser({}))
      await expect(setPostStatus(0, 'published')).rejects.toBeInstanceOf(ValidationError)
      await expect(setPostStatus(1, 'deleted' as never)).rejects.toBeInstanceOf(ValidationError)
    })

    it('makes a published post public and hides it again when unpublished or archived', async () => {
      const owner = await createUser({})
      await signInAs(owner)
      const post = await createPost({ title: 'T', body: 'B' })
      signOut()
      await expect(getPost(post.id)).rejects.toBeInstanceOf(NotFoundError)

      await signInAs(owner)
      await setPostStatus(post.id, 'published')
      signOut()
      expect((await getPost(post.id)).status).toBe('published')
      expect((await listPosts({ page: 1, perPage: 10 })).totalItems).toBe(1)

      await signInAs(owner)
      await setPostStatus(post.id, 'archived')
      signOut()
      await expect(getPost(post.id)).rejects.toBeInstanceOf(NotFoundError)
      expect((await listPosts({ page: 1, perPage: 10 })).totalItems).toBe(0)
    })

    it('does not let two concurrent moves from the same status both succeed', async () => {
      const owner = await createUser({})
      const post = await seedPost(owner.id, 'T', 'B', 'published')
      await signInAs(owner)
      const results = await Promise.allSettled([
        setPostStatus(post.id, 'archived'),
        setPostStatus(post.id, 'draft'),
      ])
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    })

    it('refuses the move when the conditional write matches nothing', async () => {
      const owner = await createUser({})
      const post = await seedPost(owner.id, 'T', 'B', 'draft')
      await signInAs(owner)
      vi.spyOn(db.post, 'updateMany').mockImplementation(
        () => db.post.delete({ where: { id: post.id } }).then(() => ({ count: 0 })) as never,
      )
      // The row changed (here: was deleted) after the checks, so the guarded write matches nothing.
      await expect(setPostStatus(post.id, 'published')).rejects.toBeInstanceOf(ValidationError)
    })
  })

  describe('commentCount', () => {
    it('counts comments in lists and details, and refreshes the cached copies', async () => {
      const author = await createUser({})
      const reader = await createUser({})
      const post = await seedPost(author.id, 'T')
      expect((await listPosts({ page: 1, perPage: 10 })).items[0].commentCount).toBe(0)
      expect((await getPost(post.id)).commentCount).toBe(0)

      await db.comment.create({ data: { postId: post.id, userId: reader.id, body: 'Hi' } })
      await db.comment.create({ data: { postId: post.id, userId: reader.id, body: 'Again' } })
      // The tests wrote straight to the database, so the caches are stale until invalidated.
      await invalidateTags(POSTS_TAG)
      expect((await listPosts({ page: 1, perPage: 10 })).items[0].commentCount).toBe(2)
      expect((await getPost(post.id)).commentCount).toBe(2)
    })
  })
})
