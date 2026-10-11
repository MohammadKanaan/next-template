// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DELETE, GET, PATCH } from '@/app/api/v1/posts/[id]/route'
import { db } from '@/lib/data/db'
import { createUser, resetDatabase, signInAs, signOut } from '../../../../helpers/server'

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

const seedPost = (userId: string, published = true) => {
  return db.post.create({ data: { userId, title: 'Title', body: 'Body', published } })
}

const titleOf = async (id: number) => {
  return (await db.post.findUniqueOrThrow({ where: { id } })).title
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
        body: 'Body',
        published: true,
        author: { id: author.id },
        permissions: { update: false, delete: false },
      })
      expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt)
      expect(new Date(body.updatedAt).toISOString()).toBe(body.updatedAt)
    })

    it('reports what the viewer may do', async () => {
      const author = await createUser({})
      const admin = await createUser({ role: 'admin' })
      const post = await seedPost(author.id)
      await signInAs(author)
      expect((await (await show(post.id)).json()).permissions).toEqual({
        update: true,
        delete: true,
      })
      await signInAs(admin)
      expect((await (await show(post.id)).json()).permissions).toEqual({
        update: true,
        delete: true,
      })
    })

    it('answers 404 for a missing or malformed id and for a draft that is not the viewer’s', async () => {
      const author = await createUser({})
      const other = await createUser({})
      const admin = await createUser({ role: 'admin' })
      const draft = await seedPost(author.id, false)
      expect((await show(999)).status).toBe(404)
      expect((await show('abc')).status).toBe(404)
      expect(await (await show(draft.id)).json()).toEqual({
        code: 'NOT_FOUND',
        message: 'Post not found',
      })
      await signInAs(other)
      expect((await show(draft.id)).status).toBe(404)
      await signInAs(author)
      expect((await show(draft.id)).status).toBe(200)
      await signInAs(admin)
      expect((await show(draft.id)).status).toBe(200)
    })
  })

  describe('PATCH', () => {
    it('answers 401 without a session', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      const response = await patch(post.id, { title: 'New' })
      expect(response.status).toBe(401)
      expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' })
      expect(await titleOf(post.id)).toBe('Title')
    })

    it('answers 401, not 422, to an anonymous caller whatever the body, content type or id', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      expect((await patch(post.id, {})).status).toBe(401)
      expect((await patch(post.id, 'title=T', 'application/x-www-form-urlencoded')).status).toBe(
        401,
      )
      expect((await patch(post.id, '{"title":')).status).toBe(401)
      expect((await patch('abc', { title: 'x' })).status).toBe(401)
      expect(await titleOf(post.id)).toBe('Title')
    })

    it('lets the author change title, body and published, answering 200 with the detail', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id, false)
      await signInAs(author)
      const response = await patch(post.id, { title: ' New ', body: 'Changed', published: true })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        id: post.id,
        title: 'New',
        body: 'Changed',
        published: true,
        permissions: { update: true, delete: true },
      })
      expect(await titleOf(post.id)).toBe('New')
    })

    it('changes only the fields passed', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      const response = await patch(post.id, { published: false })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        title: 'Title',
        body: 'Body',
        published: false,
      })
    })

    it('lets an admin change someone else’s post', async () => {
      const author = await createUser({})
      const admin = await createUser({ role: 'admin' })
      const post = await seedPost(author.id)
      await signInAs(admin)
      const response = await patch(post.id, { title: 'By admin' })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ title: 'By admin', author: { id: author.id } })
    })

    it('answers 403 for another user and changes nothing, draft or published', async () => {
      const author = await createUser({})
      const other = await createUser({})
      const post = await seedPost(author.id)
      const draft = await seedPost(author.id, false)
      await signInAs(other)
      const response = await patch(post.id, { title: 'Hijacked' })
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({
        code: 'FORBIDDEN',
        message: 'You cannot change this post',
      })
      expect((await patch(draft.id, { title: 'Hijacked' })).status).toBe(403)
      expect(await titleOf(post.id)).toBe('Title')
      expect(await titleOf(draft.id)).toBe('Title')
    })

    it('answers 404 for a missing post', async () => {
      await signInAs(await createUser({}))
      const response = await patch(999, { title: 'x' })
      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' })
    })

    it('answers 422 for an empty or invalid body, and for a malformed id', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      const empty = await patch(post.id, {})
      expect(empty.status).toBe(422)
      expect((await empty.json()).fieldErrors).toEqual({ base: ['Provide at least one attribute'] })
      const invalid = await patch(post.id, { title: '' })
      expect(invalid.status).toBe(422)
      expect((await invalid.json()).fieldErrors.title).toEqual(['Title is required'])
      expect((await patch(post.id, { published: 'true' })).status).toBe(422)
      expect((await patch('abc', { title: 'x' })).status).toBe(422)
      expect((await patch(0, { title: 'x' })).status).toBe(422)
      expect(await titleOf(post.id)).toBe('Title')
    })

    it('answers 422 for a content type other than JSON and for malformed JSON', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      const wrongType = await patch(post.id, 'title=x', 'text/plain')
      expect(wrongType.status).toBe(422)
      expect(await wrongType.json()).toMatchObject({
        message: 'Content-Type must be application/json',
      })
      const malformed = await patch(post.id, '{"title":')
      expect(malformed.status).toBe(422)
      expect(await malformed.json()).toMatchObject({
        message: 'The request body is not valid JSON',
      })
      expect((await patch(post.id, null)).status).toBe(422)
    })

    it('has no way to change the author', async () => {
      const author = await createUser({})
      const other = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      const response = await patch(post.id, { title: 'Kept', userId: other.id })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ title: 'Kept', author: { id: author.id } })
    })
  })

  describe('DELETE', () => {
    it('answers 401 without a session, whatever the id', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      signOut()
      const response = await remove(post.id)
      expect(response.status).toBe(401)
      expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' })
      expect((await remove('abc')).status).toBe(401)
      expect((await remove(999)).status).toBe(401)
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
      expect((await remove(post.id)).status).toBe(404)
    })

    it('lets an admin delete someone else’s post', async () => {
      const author = await createUser({})
      const admin = await createUser({ role: 'admin' })
      const post = await seedPost(author.id)
      await signInAs(admin)
      expect((await remove(post.id)).status).toBe(204)
      expect(await db.post.count()).toBe(0)
    })

    it('answers 403 for another user, 404 for a missing post, 422 for a malformed id', async () => {
      const author = await createUser({})
      const other = await createUser({})
      const post = await seedPost(author.id)
      const draft = await seedPost(author.id, false)
      await signInAs(other)
      expect((await remove(post.id)).status).toBe(403)
      expect((await remove(draft.id)).status).toBe(403)
      expect(await db.post.count()).toBe(2)
      expect((await remove(999)).status).toBe(404)
      const malformed = await remove('abc')
      expect(malformed.status).toBe(422)
      expect(await malformed.json()).toMatchObject({ code: 'VALIDATION' })
    })
  })
})
