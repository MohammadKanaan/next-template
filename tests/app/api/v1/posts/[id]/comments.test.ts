// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as getPost } from '@/app/api/v1/posts/[id]/route'
import { GET, POST } from '@/app/api/v1/posts/[id]/comments/route'
import { db } from '@/lib/data/db'
import { createUser, resetDatabase, signInAs } from '../../../../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../../../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

type Context = RouteContext<'/api/v1/posts/[id]/comments'>

const context = (id: string | number): Context => ({ params: Promise.resolve({ id: String(id) }) })

const url = (id: string | number) => `http://localhost/api/v1/posts/${id}/comments`

const list = (id: string | number) => GET(new Request(url(id)), context(id))

const create = (id: string | number, body: unknown, contentType = 'application/json') => {
  return POST(
    new Request(url(id), {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    context(id),
  )
}

const seedPost = (userId: string, status: 'draft' | 'published' | 'archived' = 'published') => {
  return db.post.create({ data: { userId, title: 'Title', body: 'Body', status } })
}

describe('/api/v1/posts/[id]/comments', () => {
  beforeEach(resetDatabase)
  afterAll(() => db.$disconnect())

  describe('GET', () => {
    it('lists the comments of a published post, oldest first, with per-viewer permissions', async () => {
      const author = await createUser({})
      const commenter = await createUser({})
      const post = await seedPost(author.id)
      for (const body of ['First', 'Second']) {
        await db.comment.create({ data: { body, postId: post.id, userId: commenter.id } })
      }
      const anonymous = await (await list(post.id)).json()
      expect(anonymous.map((comment: { body: string }) => comment.body)).toEqual([
        'First',
        'Second',
      ])
      expect(anonymous[0].permissions).toEqual({ delete: false })

      await signInAs(commenter)
      const response = await list(post.id)
      expect(response.status).toBe(200)
      expect((await response.json())[0].permissions).toEqual({ delete: true })
    })

    it('answers 404 for a missing post and for a draft the viewer may not see', async () => {
      const author = await createUser({})
      const draft = await seedPost(author.id, 'draft')
      expect((await list(999)).status).toBe(404)
      expect((await list('abc')).status).toBe(404)
      expect((await list(draft.id)).status).toBe(404)
      await signInAs(author)
      expect((await list(draft.id)).status).toBe(200)
    })
  })

  describe('POST', () => {
    it('answers 401 without a session', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      expect((await create(post.id, { body: 'Hi' })).status).toBe(401)
      expect(await db.comment.count()).toBe(0)
    })

    it('answers 401, not 422, to an anonymous caller whatever the body or content type', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      expect((await create(post.id, {})).status).toBe(401)
      expect((await create(post.id, 'body=Hi', 'application/x-www-form-urlencoded')).status).toBe(
        401,
      )
      expect(await db.comment.count()).toBe(0)
    })

    it('creates the comment and answers 201 with it', async () => {
      const author = await createUser({})
      const commenter = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(commenter)
      const response = await create(post.id, { body: ' Nice ' })
      expect(response.status).toBe(201)
      expect(await response.json()).toMatchObject({
        body: 'Nice',
        author: { id: commenter.id },
        permissions: { delete: true },
      })
      expect(await db.comment.count()).toBe(1)
    })

    it('answers 404 for a missing post and 403 when comments are closed', async () => {
      const author = await createUser({})
      const archived = await seedPost(author.id, 'archived')
      await signInAs(author)
      expect((await create(999, { body: 'Hi' })).status).toBe(404)
      expect((await create(archived.id, { body: 'Hi' })).status).toBe(403)
      expect(await db.comment.count()).toBe(0)
    })

    it('answers 422 for an invalid or non-JSON body and for a malformed id', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      const invalid = await create(post.id, { body: ' ' })
      expect(invalid.status).toBe(422)
      expect((await invalid.json()).fieldErrors.body).toEqual(['Comment is required'])
      expect((await create(post.id, 'body=Hi', 'text/plain')).status).toBe(422)
      expect((await create(post.id, '{"body":')).status).toBe(422)
      expect((await create('abc', { body: 'Hi' })).status).toBe(422)
      expect(await db.comment.count()).toBe(0)
    })

    it('keeps the comment count of the post up to date', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      await create(post.id, { body: 'One' })
      await create(post.id, { body: 'Two' })
      const response = await getPost(new Request(`http://localhost/api/v1/posts/${post.id}`), {
        params: Promise.resolve({ id: String(post.id) }),
      })
      expect((await response.json()).commentCount).toBe(2)
    })
  })
})
