// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from '@/app/api/v1/posts/route'
import { PUBLIC_API_LIMIT } from '@/lib/constants-rateLimit'
import { db } from '@/lib/data/db'
import { resetServerEnv } from '@/lib/server/env'
import { getRedis } from '@/lib/server/redis'
import { createUser, resetDatabase, signInAs, signOut } from '../../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

const request = (query: string) => new Request(`http://localhost/api/v1/posts${query}`)

const seedPost = (userId: string, title: string, published = true) => {
  return db.post.create({ data: { userId, title, body: 'Body', published } })
}

const titlesOf = async (response: Response) => {
  const body = await response.json()
  return body.items.map((post: { title: string }) => post.title)
}

describe('GET /api/v1/posts', () => {
  beforeEach(resetDatabase)
  afterEach(() => {
    vi.unstubAllEnvs()
    resetServerEnv()
  })
  afterAll(() => db.$disconnect())

  it('returns a page of summaries with ISO date strings', async () => {
    const author = await createUser({})
    for (const n of [1, 2, 3]) {
      await seedPost(author.id, `Post ${n}`)
    }
    const response = await GET(request('?page=1&perPage=2'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ page: 1, perPage: 2, totalItems: 3, totalPages: 2 })
    expect(body.items).toHaveLength(2)
    expect(body.items[0]).toMatchObject({
      title: 'Post 3',
      excerpt: 'Body',
      published: true,
      author: { id: author.id },
    })
    expect(body.items[0]).not.toHaveProperty('body')
    expect(new Date(body.items[0].createdAt).toISOString()).toBe(body.items[0].createdAt)
  })

  it('rejects an invalid page with field errors', async () => {
    const response = await GET(request('?page=0'))
    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body).toMatchObject({ code: 'VALIDATION', message: 'Validation failed' })
    expect(body.fieldErrors.page).toHaveLength(1)
    expect((await GET(request('?perPage=101'))).status).toBe(422)
  })

  it('filters by author', async () => {
    const a = await createUser({})
    const b = await createUser({})
    await seedPost(a.id, 'A')
    await seedPost(b.id, 'B')
    expect(await titlesOf(await GET(request(`?authorId=${b.id}`)))).toEqual(['B'])
    expect((await GET(request('?authorId=not%20an%20id'))).status).toBe(422)
  })

  it('searches titles and sorts', async () => {
    const author = await createUser({})
    for (const title of ['Cats one', 'Dogs', 'Cats two']) {
      await seedPost(author.id, title)
    }
    expect(await titlesOf(await GET(request('?q=cats&sort=oldest')))).toEqual([
      'Cats one',
      'Cats two',
    ])
    expect(await titlesOf(await GET(request('?q=CATS')))).toEqual(['Cats two', 'Cats one'])
    expect(await titlesOf(await GET(request('?q=%25')))).toEqual([])
  })

  it('rejects an unknown sort order and an overlong search', async () => {
    const response = await GET(request('?sort=garbage'))
    expect(response.status).toBe(422)
    expect((await response.json()).fieldErrors.sort).toHaveLength(1)
    expect((await GET(request(`?q=${'a'.repeat(101)}`))).status).toBe(422)
  })

  it('shows drafts only to their author listing their own posts, and to admins', async () => {
    const owner = await createUser({})
    const other = await createUser({})
    const admin = await createUser({ role: 'admin' })
    await seedPost(owner.id, 'Draft', false)
    await seedPost(owner.id, 'Live')

    signOut()
    expect(await titlesOf(await GET(request('')))).toEqual(['Live'])
    expect(await titlesOf(await GET(request(`?authorId=${owner.id}`)))).toEqual(['Live'])
    expect(await titlesOf(await GET(request(`?authorId=${owner.id}&published=false`)))).toEqual([
      'Live',
    ])
    await signInAs(other)
    expect(await titlesOf(await GET(request(`?authorId=${owner.id}`)))).toEqual(['Live'])
    await signInAs(owner)
    expect(await titlesOf(await GET(request(`?authorId=${owner.id}`)))).toEqual(['Live', 'Draft'])
    expect(await titlesOf(await GET(request(`?authorId=${owner.id}&published=false`)))).toEqual([
      'Draft',
    ])
    expect(await titlesOf(await GET(request(`?authorId=${owner.id}&published=true`)))).toEqual([
      'Live',
    ])
    expect(await titlesOf(await GET(request('')))).toEqual(['Live'])
    await signInAs(admin)
    expect(await titlesOf(await GET(request('?published=false')))).toEqual(['Draft'])
  })

  it('reads published from the query string as a string and rejects anything else', async () => {
    const author = await createUser({})
    await seedPost(author.id, 'Live')
    expect((await GET(request('?published=true'))).status).toBe(200)
    expect((await GET(request('?published=false'))).status).toBe(200)
    const response = await GET(request('?published=maybe'))
    expect(response.status).toBe(422)
    expect((await response.json()).fieldErrors.published).toHaveLength(1)
  })

  it('answers 429 once the client address is past the limit, before reading anything', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    resetServerEnv()
    // No proxy headers in a test request: the limiter's address is `unknown`.
    await getRedis().set('ratelimit:api:posts:ip:unknown', PUBLIC_API_LIMIT.max)

    const response = await GET(request('?page=garbage'))
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ code: 'RATE_LIMITED' })
  })
})

const jsonRequest = (body: unknown) => {
  return new Request('http://localhost/api/v1/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const rawRequest = (body: string, contentType: string) => {
  return new Request('http://localhost/api/v1/posts', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  })
}

describe('POST /api/v1/posts', () => {
  beforeEach(resetDatabase)
  afterEach(() => vi.unstubAllEnvs())

  it('answers 401 without a session and creates nothing', async () => {
    const response = await POST(jsonRequest({ title: 'T', body: 'B' }))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ code: 'UNAUTHORIZED', message: 'Sign in to continue' })
    expect(await db.post.count()).toBe(0)
  })

  it('answers 401, not 422, to an anonymous caller whatever the body or content type', async () => {
    expect((await POST(jsonRequest({}))).status).toBe(401)
    expect(
      (await POST(rawRequest('title=T&body=B', 'application/x-www-form-urlencoded'))).status,
    ).toBe(401)
    expect((await POST(rawRequest('{"title":', 'application/json'))).status).toBe(401)
    expect(await db.post.count()).toBe(0)
  })

  it('creates a draft and answers 201 with the detail', async () => {
    const author = await createUser({})
    await signInAs(author)
    const response = await POST(jsonRequest({ title: ' Hello ', body: 'World' }))
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toMatchObject({
      title: 'Hello',
      body: 'World',
      published: false,
      author: { id: author.id },
      permissions: { update: true, delete: true },
    })
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt)
    expect(await db.post.count()).toBe(1)
  })

  it('publishes at once when the body says so', async () => {
    await signInAs(await createUser({}))
    const response = await POST(jsonRequest({ title: 'Live', body: 'B', published: true }))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ published: true })
  })

  it('answers 429 once the viewer has created too many posts in production', async () => {
    await signInAs(await createUser({}))
    vi.stubEnv('NODE_ENV', 'production')
    for (let n = 0; n < 20; n++) {
      expect((await POST(jsonRequest({ title: `Post ${n}`, body: 'Body' }))).status).toBe(201)
    }
    const response = await POST(jsonRequest({ title: 'One too many', body: 'Body' }))
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ code: 'RATE_LIMITED' })
    expect(await db.post.count()).toBe(20)
  })

  it('answers 422 with field errors for invalid input', async () => {
    await signInAs(await createUser({}))
    const response = await POST(jsonRequest({ title: ' ', body: '' }))
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { title: ['Title is required'], body: ['Body is required'] },
    })
    const typed = await POST(jsonRequest({ title: 'T', body: 'B', published: 'yes' }))
    expect(typed.status).toBe(422)
    expect((await typed.json()).fieldErrors.published).toHaveLength(1)
    expect(await db.post.count()).toBe(0)
  })

  it('answers 422 for a content type other than JSON', async () => {
    await signInAs(await createUser({}))
    const response = await POST(rawRequest('title=T&body=B', 'application/x-www-form-urlencoded'))
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      code: 'VALIDATION',
      message: 'Content-Type must be application/json',
      fieldErrors: { base: ['Content-Type must be application/json'] },
    })
    expect((await POST(rawRequest('{"title":"T","body":"B"}', 'text/plain'))).status).toBe(422)
    expect(await db.post.count()).toBe(0)
  })

  it('accepts a JSON content type with parameters, in any case', async () => {
    await signInAs(await createUser({}))
    const response = await POST(
      rawRequest('{"title":"T","body":"B"}', 'Application/JSON; charset=utf-8'),
    )
    expect(response.status).toBe(201)
  })

  it('answers 422 for malformed JSON and for a body that is not an object', async () => {
    await signInAs(await createUser({}))
    const malformed = await POST(rawRequest('{"title":', 'application/json'))
    expect(malformed.status).toBe(422)
    expect(await malformed.json()).toMatchObject({
      message: 'The request body is not valid JSON',
    })
    expect((await POST(rawRequest('', 'application/json'))).status).toBe(422)
    expect((await POST(jsonRequest(null))).status).toBe(422)
    expect((await POST(jsonRequest('text'))).status).toBe(422)
    expect((await POST(jsonRequest([]))).status).toBe(422)
    expect(await db.post.count()).toBe(0)
  })

  it('cannot set the author through the body', async () => {
    const author = await createUser({})
    const other = await createUser({})
    await signInAs(author)
    const response = await POST(jsonRequest({ title: 'T', body: 'B', userId: other.id }))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ author: { id: author.id } })
  })
})
