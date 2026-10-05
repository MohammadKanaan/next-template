// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import { ForbiddenError, NotFoundError, UnauthorizedError } from '@/lib/data/errors'
import { createPost, deletePost, getPost, listPosts, toExcerpt, updatePost } from '@/lib/data/posts'
import { createUser, resetDatabase, signInAs, signOut } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

async function seedPost(userId: string, title = 'Post', body = 'Body') {
  return db.post.create({ data: { userId, title, body } })
}

describe('posts DAL', () => {
  beforeEach(resetDatabase)
  afterAll(() => db.$disconnect())

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

  it('throws NotFoundError for a missing post', async () => {
    await expect(getPost(999)).rejects.toBeInstanceOf(NotFoundError)
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

  it('truncates long bodies and trims whitespace before the ellipsis', () => {
    expect(toExcerpt('short')).toBe('short')
    expect(toExcerpt('abc   def', 6)).toBe('abc…')
  })
})
