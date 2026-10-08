// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/v1/notifications/route'
import { RequestError } from '@/lib/client/errors'
import { fetchNotifications } from '@/lib/client/notifications'
import { db } from '@/lib/data/db'
import { createNotification } from '@/lib/data/notifications'
import { getRedis } from '@/lib/server/redis'
import { createUser, resetDatabase, signInAs } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/server/push', () => ({ isPushConfigured: () => false }))

describe('fetchNotifications', () => {
  const calls: string[] = []

  beforeEach(async () => {
    await resetDatabase()
    calls.length = 0
    // Route the facade's relative fetch straight into the real Route Handler.
    vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
      calls.push(input)
      return GET(new Request(new URL(input, 'http://localhost'), init))
    })
  })
  afterEach(() => vi.unstubAllGlobals())
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

  it('returns the same CursorPage the DAL returns, with Dates restored, and follows the cursor', async () => {
    const user = await createUser({})
    for (const title of ['one', 'two', 'three']) {
      await createNotification({ userId: user.id, type: 'comment', title, body: '', url: '/x' })
    }
    await signInAs(user)
    const first = await fetchNotifications({ limit: 2 })
    expect(first.items.map((item) => item.title)).toEqual(['three', 'two'])
    expect(first.items[0].createdAt).toBeInstanceOf(Date)
    expect(first.nextCursor).toEqual(expect.any(String))

    const second = await fetchNotifications({ limit: 2, cursor: first.nextCursor ?? undefined })
    expect(second.items.map((item) => item.title)).toEqual(['one'])
    expect(second.nextCursor).toBeNull()
    expect(new URL(calls[1], 'http://localhost').searchParams.get('cursor')).toBe(first.nextCursor)
  })

  it('omits an undefined cursor from the request', async () => {
    const user = await createUser({})
    await signInAs(user)
    await fetchNotifications({ cursor: undefined, limit: 5 })
    expect(new URL(calls[0], 'http://localhost').searchParams.has('cursor')).toBe(false)
  })

  it('throws a RequestError carrying the server message and status', async () => {
    const signedOut = await fetchNotifications({}).catch((caught: unknown) => caught)
    expect(signedOut).toBeInstanceOf(RequestError)
    expect(signedOut).toMatchObject({ status: 401 })
  })
})
