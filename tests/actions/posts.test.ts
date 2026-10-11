// @vitest-environment node
import { revalidatePath } from 'next/cache'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPostAction, deletePostAction, updatePostAction } from '@/actions/posts'
import { db } from '@/lib/data/db'
import { createUser, resetDatabase, signInAs } from '../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(async () => import('../helpers/cookies'))
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

const seedPost = (userId: string, published = true) => {
  return db.post.create({ data: { userId, title: 'T', body: 'B', published } })
}

describe('post actions', () => {
  beforeEach(async () => {
    await resetDatabase()
    vi.mocked(revalidatePath).mockClear()
  })
  afterAll(() => db.$disconnect())

  describe('createPostAction', () => {
    it('returns UNAUTHORIZED when signed out and does not revalidate', async () => {
      expect(await createPostAction({ title: 'T', body: 'B' })).toEqual({
        ok: false,
        code: 'UNAUTHORIZED',
        message: 'Sign in to continue',
      })
      expect(revalidatePath).not.toHaveBeenCalled()
      expect(await db.post.count()).toBe(0)
    })

    it('returns field errors for invalid input and creates nothing', async () => {
      await signInAs(await createUser({}))
      expect(await createPostAction({ title: ' ', body: '' })).toEqual({
        ok: false,
        code: 'VALIDATION',
        message: 'Validation failed',
        fieldErrors: { title: ['Title is required'], body: ['Body is required'] },
      })
      expect(await db.post.count()).toBe(0)
      expect(revalidatePath).not.toHaveBeenCalled()
    })

    it('creates a draft with trimmed values and revalidates the posts layout', async () => {
      const user = await createUser({})
      await signInAs(user)
      const result = await createPostAction({ title: ' Hello ', body: 'World' })
      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }
      expect(result.data).toMatchObject({
        title: 'Hello',
        body: 'World',
        published: false,
        author: { id: user.id },
        permissions: { update: true, delete: true },
      })
      expect(result.data.createdAt).toBeInstanceOf(Date)
      expect(revalidatePath).toHaveBeenCalledTimes(1)
      expect(revalidatePath).toHaveBeenCalledWith('/posts', 'layout')
    })

    it('publishes at once when asked', async () => {
      await signInAs(await createUser({}))
      expect(await createPostAction({ title: 'T', body: 'B', published: true })).toMatchObject({
        ok: true,
        data: { published: true },
      })
    })

    it('passes its argument to the DAL untouched, so an unexpected payload is validated there', async () => {
      await signInAs(await createUser({}))
      expect(await createPostAction(null as never)).toMatchObject({ ok: false, code: 'VALIDATION' })
      expect(await createPostAction('text' as never)).toMatchObject({
        ok: false,
        code: 'VALIDATION',
      })
      expect(await db.post.count()).toBe(0)
    })
  })

  describe('updatePostAction', () => {
    it('answers UNAUTHORIZED before looking at the input when signed out', async () => {
      expect(await updatePostAction(0, {})).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
      expect(revalidatePath).not.toHaveBeenCalled()
    })

    it('rejects an empty update', async () => {
      await signInAs(await createUser({}))
      expect(await updatePostAction(1, {})).toMatchObject({
        ok: false,
        code: 'VALIDATION',
        fieldErrors: { base: ['Provide at least one attribute'] },
      })
    })

    it('rejects a bad id', async () => {
      await signInAs(await createUser({}))
      expect(await updatePostAction(0, { title: 'x' })).toMatchObject({
        ok: false,
        code: 'VALIDATION',
      })
      expect(await updatePostAction('abc' as never, { title: 'x' })).toMatchObject({
        ok: false,
        code: 'VALIDATION',
      })
    })

    it('reports NOT_FOUND for a missing post', async () => {
      await signInAs(await createUser({}))
      expect(await updatePostAction(999, { title: 'x' })).toMatchObject({
        ok: false,
        code: 'NOT_FOUND',
        message: 'Post not found',
      })
    })

    it('forbids an intruder from updating, draft or published', async () => {
      const owner = await createUser({})
      const intruder = await createUser({})
      const post = await seedPost(owner.id)
      const draft = await seedPost(owner.id, false)
      await signInAs(intruder)
      expect(await updatePostAction(post.id, { title: 'x' })).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        message: 'You cannot change this post',
      })
      expect(await updatePostAction(draft.id, { title: 'x' })).toMatchObject({
        ok: false,
        code: 'FORBIDDEN',
      })
      expect(revalidatePath).not.toHaveBeenCalled()
    })

    it('lets the owner change the fields passed and revalidates the posts layout', async () => {
      const owner = await createUser({})
      const post = await seedPost(owner.id, false)
      await signInAs(owner)
      const result = await updatePostAction(post.id, { title: ' New ', published: true })
      expect(result).toMatchObject({
        ok: true,
        data: { id: post.id, title: 'New', body: 'B', published: true },
      })
      expect(revalidatePath).toHaveBeenCalledWith('/posts', 'layout')
    })

    it('lets an admin change someone else’s post', async () => {
      const owner = await createUser({})
      const admin = await createUser({ role: 'admin' })
      const post = await seedPost(owner.id)
      await signInAs(admin)
      expect(await updatePostAction(post.id, { body: 'Moderated' })).toMatchObject({
        ok: true,
        data: { body: 'Moderated', author: { id: owner.id } },
      })
    })
  })

  describe('deletePostAction', () => {
    it('returns UNAUTHORIZED when signed out', async () => {
      const owner = await createUser({})
      const post = await seedPost(owner.id)
      expect(await deletePostAction(post.id)).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
      expect(await db.post.count()).toBe(1)
    })

    it('maps a bad id, a missing post and an intruder to codes without revalidating', async () => {
      const owner = await createUser({})
      const intruder = await createUser({})
      const post = await seedPost(owner.id)
      await signInAs(intruder)
      expect(await deletePostAction(1.5)).toMatchObject({ ok: false, code: 'VALIDATION' })
      expect(await deletePostAction(999)).toMatchObject({ ok: false, code: 'NOT_FOUND' })
      expect(await deletePostAction(post.id)).toMatchObject({ ok: false, code: 'FORBIDDEN' })
      expect(await db.post.count()).toBe(1)
      expect(revalidatePath).not.toHaveBeenCalled()
    })

    it('lets the owner delete once, revalidating, then reports NOT_FOUND', async () => {
      const owner = await createUser({})
      const post = await seedPost(owner.id)
      await signInAs(owner)
      expect(await deletePostAction(post.id)).toEqual({ ok: true, data: null })
      expect(await db.post.count()).toBe(0)
      expect(revalidatePath).toHaveBeenCalledTimes(1)
      expect(revalidatePath).toHaveBeenCalledWith('/posts', 'layout')
      expect(await deletePostAction(post.id)).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    })
  })
})
