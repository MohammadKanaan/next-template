// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/v1/posts/route'
import { fetchPosts, RequestError } from '@/lib/client/posts'
import { db } from '@/lib/data/db'
import { createUser, resetDatabase } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

describe('fetchPosts', () => {
  beforeEach(async () => {
    await resetDatabase()
    // Route the facade's relative fetch straight into the real Route Handler.
    vi.stubGlobal('fetch', (input: string, init?: RequestInit) =>
      GET(new Request(new URL(input, 'http://localhost'), init)),
    )
  })
  afterEach(() => vi.unstubAllGlobals())
  afterAll(() => db.$disconnect())

  it('returns the same Page<PostSummary> the DAL returns, with Dates restored', async () => {
    const author = await createUser({})
    await db.post.create({ data: { userId: author.id, title: 'Hello', body: 'World' } })
    const page = await fetchPosts({ page: 1, perPage: 9 })
    expect(page).toMatchObject({ page: 1, perPage: 9, totalItems: 1, totalPages: 1 })
    expect(page.items[0]).toMatchObject({
      title: 'Hello',
      excerpt: 'World',
      author: { id: author.id },
    })
    expect(page.items[0].createdAt).toBeInstanceOf(Date)
  })

  it('forwards the search and sort order to the Route Handler', async () => {
    const author = await createUser({})
    await db.post.create({ data: { userId: author.id, title: 'Cats', body: 'b' } })
    await db.post.create({ data: { userId: author.id, title: 'Dogs', body: 'b' } })
    await db.post.create({ data: { userId: author.id, title: 'More cats', body: 'b' } })
    const page = await fetchPosts({ page: 1, perPage: 9, q: 'cats', sort: 'oldest' })
    expect(page.items.map((post) => post.title)).toEqual(['Cats', 'More cats'])
  })

  it('omits an empty search from the request', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
      calls.push(input)
      return GET(new Request(new URL(input, 'http://localhost'), init))
    })
    await fetchPosts({ page: 1, perPage: 9, q: '' })
    expect(calls[0]).not.toContain('q=')
  })

  it('throws a RequestError carrying the server message and status', async () => {
    const error = await fetchPosts({ page: 0, perPage: 9 }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(RequestError)
    expect(error).toMatchObject({ status: 422, message: 'Validation failed' })
  })
})
