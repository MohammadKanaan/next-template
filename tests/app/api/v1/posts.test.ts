// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/v1/posts/route'
import { db } from '@/lib/data/db'
import { createUser, resetDatabase } from '../../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

const request = (query: string) => new Request(`http://localhost/api/v1/posts${query}`)

describe('GET /api/v1/posts', () => {
  beforeEach(resetDatabase)
  afterAll(() => db.$disconnect())

  it('returns a page of summaries with ISO date strings', async () => {
    const author = await createUser({})
    for (const n of [1, 2, 3]) {
      await db.post.create({
        data: { userId: author.id, title: `Post ${n}`, body: 'Body', status: 'published' },
      })
    }
    const response = await GET(request('?page=1&perPage=2'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ page: 1, perPage: 2, totalItems: 3, totalPages: 2 })
    expect(body.items).toHaveLength(2)
    expect(new Date(body.items[0].createdAt).toISOString()).toBe(body.items[0].createdAt)
  })

  it('rejects an invalid page with field errors', async () => {
    const response = await GET(request('?page=0'))
    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body).toMatchObject({ code: 'VALIDATION', message: 'Validation failed' })
    expect(body.fieldErrors.page).toHaveLength(1)
  })

  it('filters by author', async () => {
    const a = await createUser({})
    const b = await createUser({})
    await db.post.create({ data: { userId: a.id, title: 'A', body: 'Body', status: 'published' } })
    await db.post.create({ data: { userId: b.id, title: 'B', body: 'Body', status: 'published' } })
    const body = await (await GET(request(`?authorId=${b.id}`))).json()
    expect(body.items.map((post: { title: string }) => post.title)).toEqual(['B'])
  })

  it('searches titles and sorts', async () => {
    const author = await createUser({})
    for (const title of ['Cats one', 'Dogs', 'Cats two']) {
      await db.post.create({
        data: { userId: author.id, title, body: 'Body', status: 'published' },
      })
    }
    const body = await (await GET(request('?q=cats&sort=oldest'))).json()
    expect(body.items.map((post: { title: string }) => post.title)).toEqual([
      'Cats one',
      'Cats two',
    ])
  })

  it('rejects an unknown sort order', async () => {
    const response = await GET(request('?sort=garbage'))
    expect(response.status).toBe(422)
    expect((await response.json()).fieldErrors.sort).toHaveLength(1)
  })
})
