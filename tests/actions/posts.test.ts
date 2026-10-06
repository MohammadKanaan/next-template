// @vitest-environment node
import { revalidatePath } from 'next/cache'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPostAction,
  deletePostAction,
  setPostStatusAction,
  updatePostAction,
} from '@/actions/posts'
import { db } from '@/lib/data/db'
import { createUser, resetDatabase, signInAs } from '../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(async () => import('../helpers/cookies'))
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

describe('post actions', () => {
  beforeEach(async () => {
    await resetDatabase()
    vi.mocked(revalidatePath).mockClear()
  })
  afterAll(() => db.$disconnect())

  it('returns UNAUTHORIZED when signed out and does not revalidate', async () => {
    expect(await createPostAction({ title: 'T', body: 'B' })).toEqual({
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'Sign in to continue',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
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
  })

  it('creates a post with trimmed values and revalidates the posts layout', async () => {
    await signInAs(await createUser({}))
    const result = await createPostAction({ title: ' Hello ', body: 'World' })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.data.title).toBe('Hello')
    expect(result.data.createdAt).toBeInstanceOf(Date)
    expect(revalidatePath).toHaveBeenCalledWith('/posts', 'layout')
  })

  it('rejects an empty update', async () => {
    await signInAs(await createUser({}))
    const result = await updatePostAction(1, {})
    expect(result).toMatchObject({
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
  })

  it('answers UNAUTHORIZED before looking at the input when signed out', async () => {
    expect(await updatePostAction(0, {})).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
  })

  it('forbids an intruder from updating', async () => {
    const owner = await createUser({})
    const intruder = await createUser({})
    const post = await db.post.create({ data: { userId: owner.id, title: 'T', body: 'B' } })
    await signInAs(intruder)
    expect(await updatePostAction(post.id, { title: 'x' })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
  })

  it('lets the owner delete once, then reports NOT_FOUND', async () => {
    const owner = await createUser({})
    const post = await db.post.create({ data: { userId: owner.id, title: 'T', body: 'B' } })
    await signInAs(owner)
    expect(await deletePostAction(post.id)).toEqual({ ok: true, data: null })
    expect(await db.post.count()).toBe(0)
    expect(await deletePostAction(post.id)).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  })

  it('creates a draft with tags', async () => {
    await signInAs(await createUser({}))
    const result = await createPostAction({ title: 'T', body: 'B', tags: ['News'] })
    expect(result).toMatchObject({ ok: true, data: { status: 'draft', tags: ['news'] } })
  })

  it('moves a post through the workflow and revalidates the posts layout', async () => {
    const owner = await createUser({})
    const post = await db.post.create({ data: { userId: owner.id, title: 'T', body: 'B' } })
    await signInAs(owner)
    const result = await setPostStatusAction(post.id, 'published')
    expect(result).toMatchObject({ ok: true, data: { status: 'published' } })
    expect(revalidatePath).toHaveBeenCalledWith('/posts', 'layout')
  })

  it('maps status failures to codes and does not revalidate', async () => {
    const owner = await createUser({})
    const intruder = await createUser({})
    const post = await db.post.create({ data: { userId: owner.id, title: 'T', body: 'B' } })

    expect(await setPostStatusAction(post.id, 'published')).toMatchObject({
      ok: false,
      code: 'UNAUTHORIZED',
    })
    await signInAs(intruder)
    expect(await setPostStatusAction(post.id, 'published')).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
    await signInAs(owner)
    expect(await setPostStatusAction(post.id, 'archived')).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { status: ['A draft post cannot become archived'] },
    })
    expect(await setPostStatusAction(999, 'published')).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
