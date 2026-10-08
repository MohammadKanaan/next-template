// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/v1/posts/[id]/comments/route'
import { RequestError } from '@/lib/client/errors'
import { fetchComments } from '@/lib/client/comments'
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

describe('fetchComments', () => {
  beforeEach(async () => {
    await resetDatabase()
    // Route the facade's relative fetch straight into the real Route Handler.
    vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
      const id = /\/posts\/(\d+)\/comments/.exec(input)?.[1] ?? ''
      return GET(new Request(new URL(input, 'http://localhost'), init), {
        params: Promise.resolve({ id }),
      })
    })
  })
  afterEach(() => vi.unstubAllGlobals())
  afterAll(() => db.$disconnect())

  it('returns the same CursorPage<Comment> the DAL returns, with Dates restored, and follows the cursor', async () => {
    const author = await createUser({})
    const post = await db.post.create({
      data: { userId: author.id, title: 'Post', body: 'Body', status: 'published' },
    })
    for (const body of ['A', 'B', 'C']) {
      await db.comment.create({ data: { body, postId: post.id, userId: author.id } })
    }
    const first = await fetchComments(post.id, { limit: 2 })
    expect(first.items.map((comment) => comment.body)).toEqual(['A', 'B'])
    expect(first.items[0].createdAt).toBeInstanceOf(Date)
    expect(first.items[0].permissions).toEqual({ delete: false })

    const second = await fetchComments(post.id, { cursor: first.nextCursor ?? undefined })
    expect(second.items.map((comment) => comment.body)).toEqual(['C'])
    expect(second.nextCursor).toBeNull()
  })

  it('throws a RequestError carrying the status for a missing post', async () => {
    const error = await fetchComments(999, {}).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(RequestError)
    expect(error).toMatchObject({ status: 404 })
  })
})
