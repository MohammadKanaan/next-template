// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import {
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/data/errors'
import { createPost, deletePost, getPost, listPosts, updatePost } from '@/lib/data/posts'
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

/** Posts are drafts by default; the tests that read them back as a visitor need them published. */
const seedPost = async (userId: string, title = 'Post', body = 'Body', published = true) => {
  return db.post.create({ data: { userId, title, body, published } })
}

const cachedKeys = () => getRedis().keys('cache:v:*')

const titles = async (params: Partial<Parameters<typeof listPosts>[0]> = {}) => {
  const page = await listPosts({ page: 1, perPage: 10, ...params })
  return page.items.map((post) => post.title)
}

describe('posts DAL', () => {
  beforeEach(resetDatabase)
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe('listPosts', () => {
    it('lists newest first as a Page of summaries with an excerpt and author', async () => {
      const author = await createUser({ name: 'Leanne Graham' })
      for (const n of [1, 2, 3]) {
        await seedPost(author.id, `Post ${n}`, 'x'.repeat(200))
      }
      const page = await listPosts({ page: 1, perPage: 2 })
      expect(page).toMatchObject({ page: 1, perPage: 2, totalItems: 3, totalPages: 2 })
      expect(page.items.map((post) => post.title)).toEqual(['Post 3', 'Post 2'])
      expect(page.items[0].excerpt).toBe(`${'x'.repeat(160)}…`)
      expect(page.items[0].published).toBe(true)
      expect(page.items[0].createdAt).toBeInstanceOf(Date)
      expect(page.items[0].author).toEqual({
        id: author.id,
        name: 'Leanne Graham',
        username: author.username,
        website: null,
      })
      expect(page.items[0]).not.toHaveProperty('body')
      expect(page.items[0]).not.toHaveProperty('permissions')
    })

    it('keeps a short body whole as the excerpt', async () => {
      const author = await createUser({})
      await seedPost(author.id, 'Short', 'Just a line')
      expect((await listPosts({ page: 1, perPage: 10 })).items[0].excerpt).toBe('Just a line')
    })

    it('pages through the list', async () => {
      const author = await createUser({})
      for (const n of [1, 2, 3]) {
        await seedPost(author.id, `Post ${n}`)
      }
      const last = await listPosts({ page: 2, perPage: 2 })
      expect(last.items.map((post) => post.title)).toEqual(['Post 1'])
      expect(last).toMatchObject({ page: 2, totalPages: 2 })
      expect((await listPosts({ page: 3, perPage: 2 })).items).toEqual([])
    })

    it('filters by author', async () => {
      const a = await createUser({})
      const b = await createUser({})
      await seedPost(a.id)
      await seedPost(b.id)
      const page = await listPosts({ page: 1, perPage: 10, authorId: b.id })
      expect(page.items.map((post) => post.author.id)).toEqual([b.id])
      expect(page.totalItems).toBe(1)
    })

    it('sorts oldest first when asked, newest first by default', async () => {
      const author = await createUser({})
      for (const n of [1, 2, 3]) {
        await seedPost(author.id, `Post ${n}`)
      }
      expect(await titles({ sort: 'oldest' })).toEqual(['Post 1', 'Post 2', 'Post 3'])
      expect(await titles({ sort: 'newest' })).toEqual(['Post 3', 'Post 2', 'Post 1'])
      expect(await titles()).toEqual(['Post 3', 'Post 2', 'Post 1'])
    })

    it('does not serve one sort order from the other order cache entry', async () => {
      const author = await createUser({})
      await seedPost(author.id, 'First')
      await seedPost(author.id, 'Second')
      expect(await titles({ sort: 'newest' })).toEqual(['Second', 'First'])
      expect(await titles({ sort: 'oldest' })).toEqual(['First', 'Second'])
      expect(await cachedKeys()).toHaveLength(2)
    })

    it('searches titles case-insensitively and counts only the matches', async () => {
      const author = await createUser({})
      await seedPost(author.id, 'Learning TypeScript')
      await seedPost(author.id, 'Cooking pasta', 'typescript in the body does not count')
      await seedPost(author.id, 'typescript tips')
      const page = await listPosts({ page: 1, perPage: 10, q: 'TYPESCRIPT' })
      expect(page.items.map((post) => post.title)).toEqual([
        'typescript tips',
        'Learning TypeScript',
      ])
      expect(page.totalItems).toBe(2)
    })

    it('matches a search anywhere in the title, trimmed', async () => {
      const author = await createUser({})
      await seedPost(author.id, 'Notes on cats and dogs')
      expect(await titles({ q: '  cats  ' })).toEqual(['Notes on cats and dogs'])
      expect(await titles({ q: 'and dogs' })).toEqual(['Notes on cats and dogs'])
      expect(await titles({ q: 'birds' })).toEqual([])
    })

    it('treats punctuation in a search as text, never as a pattern', async () => {
      const author = await createUser({})
      await seedPost(author.id, '100% done')
      await seedPost(author.id, 'snake_case')
      await seedPost(author.id, 'back\\slash')
      await seedPost(author.id, 'Plain title')
      expect(await titles({ q: '%' })).toEqual(['100% done'])
      expect(await titles({ q: '_' })).toEqual(['snake_case'])
      expect(await titles({ q: '\\' })).toEqual(['back\\slash'])
      expect(await titles({ q: '100%' })).toEqual(['100% done'])
      // As wildcards these would match 'snake_case'; as text they match nothing.
      expect(await titles({ q: 'sn_ke' })).toEqual([])
      expect(await titles({ q: 'e%c' })).toEqual([])
      expect((await listPosts({ page: 1, perPage: 10, q: '%' })).totalItems).toBe(1)
    })

    it('combines search with sort and author filter', async () => {
      const a = await createUser({})
      const b = await createUser({})
      await seedPost(a.id, 'alpha one')
      await seedPost(b.id, 'alpha two')
      await seedPost(a.id, 'alpha three')
      expect(await titles({ q: 'alpha', authorId: a.id, sort: 'oldest' })).toEqual([
        'alpha one',
        'alpha three',
      ])
    })

    it('keeps an author filter that spells "all" apart from the unfiltered list', async () => {
      const author = await createUser({})
      await seedPost(author.id, 'Visible')
      expect(await titles({ authorId: 'all' })).toEqual([])
      expect(await titles()).toEqual(['Visible'])
    })

    it('answers an empty page, never an error, for an unknown author', async () => {
      expect(await listPosts({ page: 1, perPage: 10, authorId: crypto.randomUUID() })).toEqual({
        items: [],
        page: 1,
        perPage: 10,
        totalItems: 0,
        totalPages: 1,
      })
    })

    it('validates its query itself', async () => {
      await expect(listPosts({ page: 1, perPage: 101 })).rejects.toBeInstanceOf(ValidationError)
      await expect(listPosts({ page: 0, perPage: 10 })).rejects.toBeInstanceOf(ValidationError)
      await expect(listPosts({ page: 1001, perPage: 10 })).rejects.toBeInstanceOf(ValidationError)
      await expect(listPosts({ page: 1, perPage: 10, authorId: 'a b' })).rejects.toBeInstanceOf(
        ValidationError,
      )
      await expect(
        listPosts({ page: 1, perPage: 10, sort: 'garbage' as never }),
      ).rejects.toBeInstanceOf(ValidationError)
      await expect(listPosts({ page: 1, perPage: 10, q: 'x'.repeat(101) })).rejects.toBeInstanceOf(
        ValidationError,
      )
      await expect(
        listPosts({ page: 1, perPage: 10, published: 'maybe' as never }),
      ).rejects.toBeInstanceOf(ValidationError)
    })

    it('applies the defaults of the query: page 1, ten per page, newest first', async () => {
      const author = await createUser({})
      await seedPost(author.id, 'First')
      await seedPost(author.id, 'Second')
      const page = await listPosts({})
      expect(page).toMatchObject({ page: 1, perPage: 10, totalItems: 2 })
      expect(page.items.map((post) => post.title)).toEqual(['Second', 'First'])
    })
  })

  describe('getPost', () => {
    it('throws NotFoundError for a missing post', async () => {
      await expect(getPost(999)).rejects.toBeInstanceOf(NotFoundError)
    })

    it('accepts a route param as the id and treats a malformed one as not found', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id, 'By param')
      expect((await getPost(String(post.id))).title).toBe('By param')
      await expect(getPost('abc')).rejects.toBeInstanceOf(NotFoundError)
      await expect(getPost(-1)).rejects.toBeInstanceOf(NotFoundError)
      await expect(getPost('1.5')).rejects.toBeInstanceOf(NotFoundError)
      await expect(getPost('2147483648')).rejects.toBeInstanceOf(NotFoundError)
    })

    it('returns the detail: full body, timestamps, author and permissions', async () => {
      const author = await createUser({ name: 'Leanne Graham' })
      const post = await seedPost(author.id, 'Title', 'x'.repeat(400))
      signOut()
      const detail = await getPost(post.id)
      expect(detail).toEqual({
        id: post.id,
        title: 'Title',
        body: 'x'.repeat(400),
        published: true,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        author: { id: author.id, name: 'Leanne Graham', username: author.username, website: null },
        permissions: { update: false, delete: false },
      })
      expect(detail.createdAt).toBeInstanceOf(Date)
      expect(detail.updatedAt).toBeInstanceOf(Date)
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
  })

  describe('createPost', () => {
    it('checks the session before the input', async () => {
      await expect(createPost({ title: '', body: '' })).rejects.toBeInstanceOf(UnauthorizedError)
      expect(await db.post.count()).toBe(0)
    })

    it('validates a new post itself, so a caller that skips the schema cannot write bad data', async () => {
      await signInAs(await createUser({}))
      const error = await createPost({ title: ' ', body: 'x'.repeat(5001) }).catch((e) => e)
      expect(error).toBeInstanceOf(ValidationError)
      expect(error.fieldErrors).toEqual({
        title: ['Title is required'],
        body: ['Body must be 5000 characters or fewer'],
      })
      await expect(
        createPost({ title: 'T', body: 'B', published: 'true' as never }),
      ).rejects.toBeInstanceOf(ValidationError)
      expect(await db.post.count()).toBe(0)
      expect((await createPost({ title: '  Trimmed  ', body: ' Body ' })).title).toBe('Trimmed')
    })

    it('creates as the viewer, a draft by default, with the owner permissions', async () => {
      const user = await createUser({})
      await signInAs(user)
      const post = await createPost({ title: 'T', body: 'B' })
      expect(post).toMatchObject({
        title: 'T',
        body: 'B',
        published: false,
        author: { id: user.id },
        permissions: { update: true, delete: true },
      })
      expect(post.createdAt).toBeInstanceOf(Date)
      const row = await db.post.findUniqueOrThrow({ where: { id: post.id } })
      expect(row).toMatchObject({ userId: user.id, published: false })
    })

    it('publishes at once when asked', async () => {
      await signInAs(await createUser({}))
      const post = await createPost({ title: 'Live', body: 'B', published: true })
      expect(post.published).toBe(true)
      signOut()
      expect((await getPost(post.id)).title).toBe('Live')
    })

    it('cannot set the author through the input', async () => {
      const author = await createUser({})
      const other = await createUser({})
      await signInAs(author)
      const post = await createPost({ title: 'T', body: 'B', userId: other.id } as never)
      expect(post.author.id).toBe(author.id)
    })

    it('rate limits post creation per user in production', async () => {
      const [first, second] = [await createUser({}), await createUser({})]
      await signInAs(first)
      vi.stubEnv('NODE_ENV', 'production')
      for (let n = 0; n < 20; n++) {
        await createPost({ title: `Post ${n}`, body: 'Body' })
      }
      await expect(createPost({ title: 'One too many', body: 'Body' })).rejects.toBeInstanceOf(
        RateLimitedError,
      )
      // The limit comes right after the session check, before the input is looked at.
      await expect(createPost({ title: '', body: '' })).rejects.toBeInstanceOf(RateLimitedError)
      expect(await db.post.count({ where: { userId: first.id } })).toBe(20)

      await signInAs(second)
      await expect(createPost({ title: 'Mine', body: 'Body' })).resolves.toMatchObject({
        title: 'Mine',
      })
    })

    it('counts nothing outside production', async () => {
      await signInAs(await createUser({}))
      for (let n = 0; n < 21; n++) {
        await createPost({ title: `Post ${n}`, body: 'Body' })
      }
      expect(await db.post.count()).toBe(21)
      expect(await getRedis().keys('ratelimit:*')).toEqual([])
    })
  })

  describe('updatePost', () => {
    it('checks session, then input, then existence, then ownership', async () => {
      const owner = await createUser({})
      const intruder = await createUser({})
      const post = await seedPost(owner.id)

      signOut()
      await expect(updatePost('abc', {})).rejects.toBeInstanceOf(UnauthorizedError)
      await expect(updatePost(post.id, { title: 'x' })).rejects.toBeInstanceOf(UnauthorizedError)

      await signInAs(intruder)
      await expect(updatePost('abc', { title: 'x' })).rejects.toBeInstanceOf(ValidationError)
      await expect(updatePost(0, { title: 'x' })).rejects.toBeInstanceOf(ValidationError)
      await expect(updatePost(999, {})).rejects.toBeInstanceOf(ValidationError)
      await expect(updatePost(999, { title: 'x' })).rejects.toBeInstanceOf(NotFoundError)
      await expect(updatePost(post.id, { title: 'x' })).rejects.toBeInstanceOf(ForbiddenError)

      await signInAs(owner)
      expect(await updatePost(post.id, { title: 'Renamed' })).toMatchObject({
        title: 'Renamed',
        body: 'Body',
        permissions: { update: true, delete: true },
      })
    })

    it('answers 403, not 404, to a stranger who tries to change a draft', async () => {
      const owner = await createUser({})
      const intruder = await createUser({})
      const draft = await seedPost(owner.id, 'Draft', 'B', false)
      await signInAs(intruder)
      await expect(updatePost(draft.id, { title: 'x' })).rejects.toBeInstanceOf(ForbiddenError)
      await expect(deletePost(draft.id)).rejects.toBeInstanceOf(ForbiddenError)
    })

    it('validates the update and reports each field', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      const empty = await updatePost(post.id, {}).catch((e) => e)
      expect(empty).toBeInstanceOf(ValidationError)
      expect(empty.fieldErrors).toEqual({ base: ['Provide at least one attribute'] })
      await expect(updatePost(post.id, { title: undefined })).rejects.toBeInstanceOf(
        ValidationError,
      )
      const invalid = await updatePost(post.id, { title: '', body: 'x'.repeat(5001) }).catch(
        (e) => e,
      )
      expect(invalid.fieldErrors).toEqual({
        title: ['Title is required'],
        body: ['Body must be 5000 characters or fewer'],
      })
      expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).title).toBe('Post')
    })

    it('changes only the fields passed, trimmed, and moves updatedAt', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id, 'Title', 'Body')
      await signInAs(author)
      const updated = await updatePost(String(post.id), { body: '  Changed  ' })
      expect(updated).toMatchObject({ title: 'Title', body: 'Changed', published: true })
      expect(updated.updatedAt.getTime()).toBeGreaterThan(post.updatedAt.getTime())
      expect(updated.createdAt).toEqual(post.createdAt)
    })

    it('publishes and unpublishes through the published flag', async () => {
      const author = await createUser({})
      const draft = await seedPost(author.id, 'Draft', 'B', false)
      await signInAs(author)
      expect((await updatePost(draft.id, { published: true })).published).toBe(true)
      signOut()
      expect((await getPost(draft.id)).published).toBe(true)
      await signInAs(author)
      expect((await updatePost(draft.id, { published: false })).published).toBe(false)
      signOut()
      await expect(getPost(draft.id)).rejects.toBeInstanceOf(NotFoundError)
    })

    it('ignores fields the input does not know', async () => {
      const author = await createUser({})
      const other = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      const updated = await updatePost(post.id, { title: 'Kept', userId: other.id } as never)
      expect(updated.author.id).toBe(author.id)
      expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).userId).toBe(author.id)
    })

    it('lets an admin update and delete someone else’s post', async () => {
      const owner = await createUser({})
      const admin = await createUser({ role: 'admin' })
      const post = await seedPost(owner.id)
      await signInAs(admin)
      const moderated = await updatePost(post.id, { body: 'Moderated' })
      expect(moderated.body).toBe('Moderated')
      expect(moderated.author.id).toBe(owner.id)
      expect(moderated.permissions).toEqual({ update: true, delete: true })
      await deletePost(post.id)
      expect(await db.post.count()).toBe(0)
    })
  })

  describe('deletePost', () => {
    it('checks session, then input, then existence, then ownership', async () => {
      const owner = await createUser({})
      const intruder = await createUser({})
      const post = await seedPost(owner.id)

      signOut()
      await expect(deletePost('abc')).rejects.toBeInstanceOf(UnauthorizedError)
      await expect(deletePost(post.id)).rejects.toBeInstanceOf(UnauthorizedError)

      await signInAs(intruder)
      await expect(deletePost('abc')).rejects.toBeInstanceOf(ValidationError)
      await expect(deletePost(1.5)).rejects.toBeInstanceOf(ValidationError)
      await expect(deletePost(999)).rejects.toBeInstanceOf(NotFoundError)
      await expect(deletePost(post.id)).rejects.toBeInstanceOf(ForbiddenError)
      expect(await db.post.count()).toBe(1)

      await signInAs(owner)
      await expect(deletePost(String(post.id))).resolves.toBeUndefined()
      expect(await db.post.count()).toBe(0)
      await expect(deletePost(post.id)).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  describe('a post that vanishes between the access check and the write', () => {
    it('is reported as not found', async () => {
      const owner = await createUser({})
      const post = await seedPost(owner.id)
      await signInAs(owner)
      // A genuine P2025 from Prisma: deleting a row that does not exist.
      const vanished = await db.post
        .delete({ where: { id: 999_999 } })
        .catch((error: unknown) => error)
      vi.spyOn(db.post, 'update').mockImplementation(() => Promise.reject(vanished) as never)
      await expect(updatePost(post.id, { title: 'x' })).rejects.toBeInstanceOf(NotFoundError)
      vi.spyOn(db.post, 'delete').mockImplementation(() => Promise.reject(vanished) as never)
      await expect(deletePost(post.id)).rejects.toBeInstanceOf(NotFoundError)
    })

    it('rethrows other database errors', async () => {
      const owner = await createUser({})
      const post = await seedPost(owner.id)
      await signInAs(owner)
      vi.spyOn(db.post, 'delete').mockImplementation(
        () => Promise.reject(new Error('boom')) as never,
      )
      await expect(deletePost(post.id)).rejects.toThrow('boom')
      vi.spyOn(db.post, 'update').mockImplementation(
        () => Promise.reject(new Error('bang')) as never,
      )
      await expect(updatePost(post.id, { title: 'x' })).rejects.toThrow('bang')
    })
  })

  describe('visibility', () => {
    it('shows a draft only to its author and admins', async () => {
      const owner = await createUser({})
      const other = await createUser({})
      const admin = await createUser({ role: 'admin' })
      const draft = await seedPost(owner.id, 'Draft', 'B', false)
      const published = await seedPost(owner.id, 'Published')

      signOut()
      await expect(getPost(draft.id)).rejects.toBeInstanceOf(NotFoundError)
      await signInAs(other)
      await expect(getPost(draft.id)).rejects.toBeInstanceOf(NotFoundError)
      await signInAs(owner)
      expect(await getPost(draft.id)).toMatchObject({
        published: false,
        permissions: { update: true, delete: true },
      })
      await signInAs(admin)
      expect(await getPost(draft.id)).toMatchObject({
        published: false,
        permissions: { update: true, delete: true },
      })
      signOut()
      expect((await getPost(published.id)).published).toBe(true)
    })

    it('answers a hidden post exactly like a missing one', async () => {
      const owner = await createUser({})
      const draft = await seedPost(owner.id, 'Draft', 'B', false)
      signOut()
      const hidden = await getPost(draft.id).catch((error: unknown) => error)
      const missing = await getPost(draft.id + 100).catch((error: unknown) => error)
      expect(hidden).toBeInstanceOf(NotFoundError)
      expect((hidden as Error).message).toBe((missing as Error).message)
    })

    it('still applies the check when the detail was cached by someone who may see it', async () => {
      const owner = await createUser({})
      const other = await createUser({})
      const draft = await seedPost(owner.id, 'Draft', 'B', false)
      await signInAs(owner)
      await getPost(draft.id)
      expect(await getRedis().keys(`cache:v:post:${draft.id}|*`)).toHaveLength(1)
      const findUnique = vi.spyOn(db.post, 'findUnique')
      await signInAs(other)
      await expect(getPost(draft.id)).rejects.toBeInstanceOf(NotFoundError)
      signOut()
      await expect(getPost(draft.id)).rejects.toBeInstanceOf(NotFoundError)
      // Both answers came from the cached copy; the check runs on it, not on the database.
      expect(findUnique).not.toHaveBeenCalled()
    })

    it('lists only published posts to visitors and other users, even by author', async () => {
      const owner = await createUser({})
      const other = await createUser({})
      await seedPost(owner.id, 'Draft', 'B', false)
      await seedPost(owner.id, 'Published')

      signOut()
      expect(await titles()).toEqual(['Published'])
      expect(await titles({ authorId: owner.id })).toEqual(['Published'])
      await signInAs(other)
      expect(await titles()).toEqual(['Published'])
      expect(await titles({ authorId: owner.id })).toEqual(['Published'])
    })

    it('lets an author see their drafts in their own list only', async () => {
      const owner = await createUser({})
      await seedPost(owner.id, 'Draft', 'B', false)
      await seedPost(owner.id, 'Published')
      await signInAs(owner)
      expect(await titles({ authorId: owner.id })).toEqual(['Published', 'Draft'])
      // Without the author filter the author is just another reader.
      expect(await titles()).toEqual(['Published'])
    })

    it('lets an admin see every draft, in any list', async () => {
      const a = await createUser({})
      const b = await createUser({})
      const admin = await createUser({ role: 'admin' })
      await seedPost(a.id, 'A draft', 'B', false)
      await seedPost(b.id, 'B draft', 'B', false)
      await seedPost(b.id, 'B live')
      await seedPost(admin.id, 'Admin draft', 'B', false)
      await signInAs(admin)
      expect(await titles({ sort: 'oldest' })).toEqual([
        'A draft',
        'B draft',
        'B live',
        'Admin draft',
      ])
      expect(await titles({ authorId: b.id, sort: 'oldest' })).toEqual(['B draft', 'B live'])
      expect(await titles({ authorId: admin.id })).toEqual(['Admin draft'])
    })

    it('counts only what the viewer may see', async () => {
      const owner = await createUser({})
      await seedPost(owner.id, 'Draft', 'B', false)
      await seedPost(owner.id, 'Published')
      signOut()
      expect((await listPosts({ page: 1, perPage: 10 })).totalItems).toBe(1)
      await signInAs(owner)
      expect((await listPosts({ page: 1, perPage: 10, authorId: owner.id })).totalItems).toBe(2)
    })

    describe('the published filter', () => {
      it('lets an author narrow their own list to drafts or to published posts', async () => {
        const owner = await createUser({})
        await seedPost(owner.id, 'Draft', 'B', false)
        await seedPost(owner.id, 'Published')
        await signInAs(owner)
        expect(await titles({ authorId: owner.id, published: false })).toEqual(['Draft'])
        expect(await titles({ authorId: owner.id, published: true })).toEqual(['Published'])
        expect(await titles({ authorId: owner.id, published: 'false' })).toEqual(['Draft'])
        expect(await titles({ authorId: owner.id })).toEqual(['Published', 'Draft'])
      })

      it('lets an admin pick drafts across every author', async () => {
        const a = await createUser({})
        const b = await createUser({})
        const admin = await createUser({ role: 'admin' })
        await seedPost(a.id, 'A draft', 'B', false)
        await seedPost(b.id, 'B draft', 'B', false)
        await seedPost(b.id, 'B live')
        await signInAs(admin)
        expect(await titles({ published: false, sort: 'oldest' })).toEqual(['A draft', 'B draft'])
        expect(await titles({ published: false, authorId: b.id })).toEqual(['B draft'])
        expect(await titles({ published: true })).toEqual(['B live'])
      })

      it('is forced to published for visitors and other users', async () => {
        const owner = await createUser({})
        const other = await createUser({})
        await seedPost(owner.id, 'Draft', 'B', false)
        await seedPost(owner.id, 'Published')
        signOut()
        expect(await titles({ published: false })).toEqual(['Published'])
        expect(await titles({ published: false, authorId: owner.id })).toEqual(['Published'])
        await signInAs(other)
        expect(await titles({ published: false })).toEqual(['Published'])
        expect(await titles({ published: false, authorId: owner.id })).toEqual(['Published'])
        // An author asking about drafts in a list that is not theirs is a reader too.
        await signInAs(owner)
        expect(await titles({ published: false })).toEqual(['Published'])
      })
    })
  })

  describe('caching', () => {
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

    it('caches the published list under page, perPage and sort', async () => {
      const author = await createUser({})
      await seedPost(author.id)
      await listPosts({ page: 1, perPage: 10 })
      await listPosts({ page: 1, perPage: 10 })
      await listPosts({ page: 2, perPage: 10 })
      await listPosts({ page: 1, perPage: 5 })
      await listPosts({ page: 1, perPage: 10, sort: 'oldest' })
      const keys = await cachedKeys()
      expect(keys).toHaveLength(4)
      expect(keys.every((key) => key.includes('posts:list'))).toBe(true)
    })

    it('caches the detail under post:<id>', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await getPost(post.id)
      const keys = await cachedKeys()
      expect(keys).toHaveLength(1)
      expect(keys[0]).toMatch(new RegExp(`^cache:v:post:${post.id}\\|`))
    })

    it('never caches a search', async () => {
      const author = await createUser({})
      await seedPost(author.id, 'Findable')
      await titles({ q: 'findable' })
      expect(await cachedKeys()).toEqual([])

      await titles()
      expect(await cachedKeys()).toHaveLength(1)

      // A search sees a new post at once: nothing cached could hide it.
      await seedPost(author.id, 'Findable too')
      expect((await listPosts({ page: 1, perPage: 10, q: 'findable' })).totalItems).toBe(2)
    })

    it('never caches an author list, whoever asks', async () => {
      const author = await createUser({})
      await seedPost(author.id, 'Mine')
      expect(await titles({ authorId: author.id })).toEqual(['Mine'])
      expect(await titles({ authorId: crypto.randomUUID() })).toEqual([])
      await signInAs(author)
      expect(await titles({ authorId: author.id })).toEqual(['Mine'])
      expect(await cachedKeys()).toEqual([])
    })

    it('never caches a list that shows drafts', async () => {
      const owner = await createUser({})
      const admin = await createUser({ role: 'admin' })
      await seedPost(owner.id, 'Draft', 'B', false)
      await signInAs(owner)
      await titles({ authorId: owner.id })
      await titles({ authorId: owner.id, published: false })
      await signInAs(admin)
      await titles()
      await titles({ published: false })
      expect(await cachedKeys()).toEqual([])
    })

    it('shares the cached published list between viewers who ask for published', async () => {
      const owner = await createUser({})
      const admin = await createUser({ role: 'admin' })
      await seedPost(owner.id, 'Draft', 'B', false)
      await seedPost(owner.id, 'Live')
      signOut()
      expect(await titles()).toEqual(['Live'])
      const findMany = vi.spyOn(db.post, 'findMany')
      await signInAs(owner)
      expect(await titles({ published: true })).toEqual(['Live'])
      await signInAs(admin)
      // The admin asking for published explicitly gets the same, safe-to-share result.
      expect(await titles({ published: true })).toEqual(['Live'])
      expect(await cachedKeys()).toHaveLength(1)
      expect(findMany).not.toHaveBeenCalled()
    })

    it('does not serve an author their drafts to a visitor through the cache', async () => {
      const owner = await createUser({})
      await seedPost(owner.id, 'Draft', 'B', false)
      await signInAs(owner)
      expect(await titles({ authorId: owner.id })).toEqual(['Draft'])
      signOut()
      expect(await titles({ authorId: owner.id })).toEqual([])
      expect(await titles()).toEqual([])
      // Nothing cached for the visitor reaches the author either.
      await signInAs(owner)
      expect(await titles({ authorId: owner.id })).toEqual(['Draft'])
    })

    it('createPost invalidates the cached list (a new draft stays out, a published post shows)', async () => {
      const author = await createUser({})
      await seedPost(author.id, 'Old')
      expect(await titles()).toEqual(['Old'])
      await signInAs(author)
      await createPost({ title: 'New draft', body: 'B' })
      const findMany = vi.spyOn(db.post, 'findMany')
      // The cached entry was dropped (a fresh query ran), and a draft is not public.
      expect(await titles()).toEqual(['Old'])
      expect(findMany).toHaveBeenCalledTimes(1)
      await createPost({ title: 'New live', body: 'B', published: true })
      expect(await titles()).toEqual(['New live', 'Old'])
    })

    it('updatePost invalidates the cached list and detail', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id, 'Before')
      await titles()
      await getPost(post.id)
      await signInAs(author)
      await updatePost(post.id, { title: 'After' })
      signOut()
      expect(await titles()).toEqual(['After'])
      expect((await getPost(post.id)).title).toBe('After')
    })

    it('updatePost leaves the cached details of other posts alone', async () => {
      const author = await createUser({})
      const changed = await seedPost(author.id, 'Changed')
      const untouched = await seedPost(author.id, 'Untouched')
      await getPost(untouched.id)
      await signInAs(author)
      await updatePost(changed.id, { title: 'Changed!' })
      // The posts tag moved, so the untouched detail is re-read too; only the data is the same.
      expect((await getPost(untouched.id)).title).toBe('Untouched')
      expect((await getPost(changed.id)).title).toBe('Changed!')
    })

    it('deletePost invalidates the cached list and detail', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await titles()
      await getPost(post.id)
      await signInAs(author)
      await deletePost(post.id)
      expect(await titles()).toEqual([])
      await expect(getPost(post.id)).rejects.toBeInstanceOf(NotFoundError)
      signOut()
      await expect(getPost(post.id)).rejects.toBeInstanceOf(NotFoundError)
    })

    it('computes permissions per viewer from a detail cached by someone else', async () => {
      const owner = await createUser({})
      const other = await createUser({})
      const post = await seedPost(owner.id)
      await signInAs(owner)
      expect((await getPost(post.id)).permissions).toEqual({ update: true, delete: true })
      const findUnique = vi.spyOn(db.post, 'findUnique')
      await signInAs(other)
      expect((await getPost(post.id)).permissions).toEqual({ update: false, delete: false })
      signOut()
      expect((await getPost(post.id)).permissions).toEqual({ update: false, delete: false })
      expect(findUnique).not.toHaveBeenCalled()
    })

    it('revives the dates of a cached detail and list', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await getPost(post.id)
      await titles()
      const detail = await getPost(post.id)
      expect(detail.createdAt).toBeInstanceOf(Date)
      expect(detail.updatedAt).toBeInstanceOf(Date)
      expect((await listPosts({ page: 1, perPage: 10 })).items[0].createdAt).toBeInstanceOf(Date)
    })

    it('does not cache a missing post', async () => {
      await expect(getPost(999)).rejects.toBeInstanceOf(NotFoundError)
      expect(await cachedKeys()).toEqual([])
      const author = await createUser({})
      await db.post.create({
        data: { id: 999, userId: author.id, title: 'Late', body: 'B', published: true },
      })
      expect((await getPost(999)).title).toBe('Late')
    })
  })
})
