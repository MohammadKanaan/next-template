// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import { UnauthorizedError } from '@/lib/data/errors'
import { getCurrentUser, getViewer, isUsernameTaken } from '@/lib/data/users'
import { cookieJar } from '../../helpers/cookies'
import { createUser, resetDatabase, signInAs } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

describe('users DAL', () => {
  beforeEach(resetDatabase)
  afterAll(() => db.$disconnect())

  it('has no viewer when signed out', async () => {
    expect(await getViewer()).toBeNull()
    await expect(getCurrentUser()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('treats a forged or stale session cookie as no viewer', async () => {
    cookieJar.set('better-auth.session_token', 'forged.value')
    expect(await getViewer()).toBeNull()
    await expect(getCurrentUser()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('returns exactly the current-user fields when signed in', async () => {
    const user = await createUser({ name: 'Ada', username: 'ada', email: 'ada@example.com' })
    await signInAs(user)
    const expected = {
      id: user.id,
      name: 'Ada',
      username: 'ada',
      email: 'ada@example.com',
      role: 'user',
    }
    expect(await getViewer()).toEqual(expected)
    expect(await getCurrentUser()).toEqual(expected)
  })

  it('reports whether a username is taken', async () => {
    await createUser({ username: 'taken' })
    expect(await isUsernameTaken('taken')).toBe(true)
    expect(await isUsernameTaken('free')).toBe(false)
  })
})
