// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as signIn } from '@/app/api/v1/auth/session/route'
import { GET as listPosts, POST as createPost } from '@/app/api/v1/posts/route'
import {
  DELETE as deletePost,
  GET as getPost,
  PATCH as patchPost,
} from '@/app/api/v1/posts/[id]/route'
import { db } from '@/server/db'
import { createUser, jsonRequest, params, resetDatabase } from './helpers'

const { cookieStore } = await vi.hoisted(async () => import('./helpers'))
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }))

async function signInAs(email: string) {
  const response = await signIn(jsonRequest('/api/v1/auth/session', 'POST', { session: { email } }))
  expect(response.status).toBe(201)
}

describe('posts API', () => {
  beforeEach(resetDatabase)
  afterAll(() => db.close())

  it('lists posts newest first as a Listing', async () => {
    const user = await createUser({})
    for (const n of [1, 2, 3]) {
      await db.orm.public.Post.create({ title: `Post ${n}`, body: 'Body', userId: user.id })
    }
    const response = await listPosts(jsonRequest('/api/v1/posts?page=1&perPage=2', 'GET'))
    const listing = await response.json()
    expect(listing).toMatchObject({
      totalCount: 3,
      totalPages: 2,
      currentPage: 1,
      nextPage: 2,
      prevPage: null,
      limitValue: 2,
    })
    expect(listing.list.map((post: { title: string }) => post.title)).toEqual(['Post 3', 'Post 2'])
    expect(listing.list[0].permissions).toEqual({ update: false, destroy: false })
  })

  it('requires a session to create', async () => {
    const response = await createPost(
      jsonRequest('/api/v1/posts', 'POST', { post: { title: 'T', body: 'B' } }),
    )
    expect(response.status).toBe(401)
  })

  it('rejects invalid posts with field errors', async () => {
    const user = await createUser({})
    await signInAs(user.email)
    const response = await createPost(
      jsonRequest('/api/v1/posts', 'POST', { post: { title: '  ', body: '' } }),
    )
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      message: 'Validation failed',
      errors: { title: ['Title is required'], body: ['Body is required'] },
    })
  })

  it('creates, updates, and deletes an owned post', async () => {
    const user = await createUser({})
    await signInAs(user.email)
    const created = await createPost(
      jsonRequest('/api/v1/posts', 'POST', { post: { title: ' Hello ', body: 'World' } }),
    )
    expect(created.status).toBe(201)
    const post = await created.json()
    expect(post).toMatchObject({ title: 'Hello', userId: user.id, user: { id: user.id } })
    expect(post.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(post.user.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(post.permissions).toEqual({ update: true, destroy: true })
    expect(post.user).not.toHaveProperty('email')

    const id = String(post.id)
    const patched = await patchPost(
      jsonRequest(`/api/v1/posts/${id}`, 'PATCH', { post: { title: 'Renamed' } }),
      params({ id }),
    )
    expect(patched.status).toBe(200)
    expect(await patched.json()).toMatchObject({ title: 'Renamed', body: 'World' })

    const deleted = await deletePost(jsonRequest(`/api/v1/posts/${id}`, 'DELETE'), params({ id }))
    expect(deleted.status).toBe(200)
    const missing = await getPost(jsonRequest(`/api/v1/posts/${id}`, 'GET'), params({ id }))
    expect(missing.status).toBe(404)
  })

  it('forbids changing someone else’s post', async () => {
    const owner = await createUser({})
    const intruder = await createUser({})
    const post = await db.orm.public.Post.create({ title: 'Mine', body: 'B', userId: owner.id })
    await signInAs(intruder.email)
    const id = String(post.id)
    const response = await patchPost(
      jsonRequest(`/api/v1/posts/${id}`, 'PATCH', { post: { title: 'Hijacked' } }),
      params({ id }),
    )
    expect(response.status).toBe(403)
  })

  it('returns 404 for a non-numeric id', async () => {
    const response = await getPost(jsonRequest('/api/v1/posts/abc', 'GET'), params({ id: 'abc' }))
    expect(response.status).toBe(404)
  })
})
