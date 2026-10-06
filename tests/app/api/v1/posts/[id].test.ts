// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DELETE, GET, PATCH } from '@/app/api/v1/posts/[id]/route'
import { db } from '@/lib/data/db'
import { createUser, resetDatabase, signInAs } from '../../../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

type Context = RouteContext<'/api/v1/posts/[id]'>

const context = (id: string | number): Context => ({ params: Promise.resolve({ id: String(id) }) })

const url = (id: string | number) => `http://localhost/api/v1/posts/${id}`

const show = (id: string | number) => GET(new Request(url(id)), context(id))

const patch = (id: string | number, body: unknown, contentType = 'application/json') => {
  return PATCH(
    new Request(url(id), {
      method: 'PATCH',
      headers: { 'content-type': contentType },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    context(id),
  )
}

const remove = (id: string | number) => {
  return DELETE(new Request(url(id), { method: 'DELETE' }), context(id))
}

const seedPost = (userId: string, status: 'draft' | 'published' | 'archived' = 'published') => {
  return db.post.create({ data: { userId, title: 'Title', body: 'Body', status } })
}

describe('/api/v1/posts/[id]', () => {
  beforeEach(resetDatabase)
  afterAll(() => db.$disconnect())

  describe('GET', () => {
    it('returns a published post to anyone, with the viewer permissions', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      const response = await show(post.id)
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toMatchObject({
        id: post.id,
        title: 'Title',
        status: 'published',
        permissions: { update: false, delete: false },
      })
      expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt)
    })

    it('answers 404 for a missing or malformed id and for a draft that is not the viewer', async () => {
      const author = await createUser({})
      const draft = await seedPost(author.id, 'draft')
      expect((await show(999)).status).toBe(404)
      expect((await show('abc')).status).toBe(404)
      expect((await show(draft.id)).status).toBe(404)
      await signInAs(author)
      expect((await show(draft.id)).status).toBe(200)
    })
  })

  describe('PATCH', () => {
    it('answers 401 without a session', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      expect((await patch(post.id, { title: 'New' })).status).toBe(401)
      expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).title).toBe('Title')
    })

    it('lets the author change title, body and tags, answering 200 with the detail', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      const response = await patch(post.id, { title: ' New ', body: 'Changed', tags: ['Tips'] })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        id: post.id,
        title: 'New',
        body: 'Changed',
        tags: ['tips'],
      })
      expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).title).toBe('New')
    })

    it('lets an admin change someone else’s post', async () => {
      const author = await createUser({})
      const admin = await createUser({ role: 'admin' })
      const post = await seedPost(author.id)
      await signInAs(admin)
      expect((await patch(post.id, { title: 'By admin' })).status).toBe(200)
    })

    it('answers 403 for another user and changes nothing', async () => {
      const author = await createUser({})
      const other = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(other)
      expect((await patch(post.id, { title: 'Hijacked' })).status).toBe(403)
      expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).title).toBe('Title')
    })

    it('answers 404 for a missing post', async () => {
      await signInAs(await createUser({}))
      expect((await patch(999, { title: 'x' })).status).toBe(404)
    })

    it('answers 422 for an empty or invalid body, and for a malformed id', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      expect((await patch(post.id, {})).status).toBe(422)
      const invalid = await patch(post.id, { title: '' })
      expect(invalid.status).toBe(422)
      expect((await invalid.json()).fieldErrors.title).toHaveLength(1)
      expect((await patch('abc', { title: 'x' })).status).toBe(422)
    })

    it('answers 422 for a content type other than JSON and for malformed JSON', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      expect((await patch(post.id, 'title=x', 'text/plain')).status).toBe(422)
      expect((await patch(post.id, '{"title":')).status).toBe(422)
    })

    it('has no way to change the status', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      const response = await patch(post.id, { title: 'Kept', status: 'archived' })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ status: 'published' })
    })
  })

  describe('DELETE', () => {
    it('answers 401 without a session', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      expect((await remove(post.id)).status).toBe(401)
      expect(await db.post.count()).toBe(1)
    })

    it('answers 204 with an empty body and deletes the post', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      const response = await remove(post.id)
      expect(response.status).toBe(204)
      expect(await response.text()).toBe('')
      expect(await db.post.count()).toBe(0)
    })

    it('answers 403 for another user, 404 for a missing post, 422 for a malformed id', async () => {
      const author = await createUser({})
      const other = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(other)
      expect((await remove(post.id)).status).toBe(403)
      expect(await db.post.count()).toBe(1)
      expect((await remove(999)).status).toBe(404)
      expect((await remove('abc')).status).toBe(422)
    })
  })
})
