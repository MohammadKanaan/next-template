// @vitest-environment node
import { revalidatePath } from 'next/cache'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCommentAction, deleteCommentAction } from '@/actions/comments'
import { db } from '@/lib/data/db'
import { createUser, resetDatabase, signInAs } from '../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(async () => import('../helpers/cookies'))
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

describe('comment actions', () => {
  beforeEach(async () => {
    await resetDatabase()
    vi.mocked(revalidatePath).mockClear()
  })
  afterAll(() => db.$disconnect())

  it('returns UNAUTHORIZED when signed out and does not revalidate', async () => {
    expect(await createCommentAction(1, { body: 'Hi' })).toMatchObject({
      ok: false,
      code: 'UNAUTHORIZED',
    })
    expect(await deleteCommentAction(1)).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('returns field errors for an empty comment', async () => {
    await signInAs(await createUser({}))
    expect(await createCommentAction(1, { body: ' ' })).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Validation failed',
      fieldErrors: { body: ['Comment is required'] },
    })
  })

  it('creates a comment on a published post and revalidates the posts layout', async () => {
    const author = await createUser({})
    const post = await db.post.create({
      data: { userId: author.id, title: 'T', body: 'B', status: 'published' },
    })
    await signInAs(author)
    const result = await createCommentAction(post.id, { body: ' Hi ' })
    expect(result).toMatchObject({ ok: true, data: { body: 'Hi', permissions: { delete: true } } })
    expect(revalidatePath).toHaveBeenCalledWith('/posts', 'layout')
  })

  it('answers NOT_FOUND for a draft the viewer cannot see and FORBIDDEN where comments are closed', async () => {
    const author = await createUser({})
    const other = await createUser({})
    const draft = await db.post.create({ data: { userId: author.id, title: 'T', body: 'B' } })
    await signInAs(other)
    expect(await createCommentAction(draft.id, { body: 'Hi' })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
    await signInAs(author)
    expect(await createCommentAction(draft.id, { body: 'Hi' })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
  })

  it('lets the commenter delete, forbids a stranger, and then reports NOT_FOUND', async () => {
    const author = await createUser({})
    const commenter = await createUser({})
    const stranger = await createUser({})
    const post = await db.post.create({
      data: { userId: author.id, title: 'T', body: 'B', status: 'published' },
    })
    const comment = await db.comment.create({
      data: { postId: post.id, userId: commenter.id, body: 'Hi' },
    })
    await signInAs(stranger)
    expect(await deleteCommentAction(comment.id)).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    await signInAs(commenter)
    expect(await deleteCommentAction(comment.id)).toEqual({ ok: true, data: null })
    expect(await deleteCommentAction(comment.id)).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  })
})
