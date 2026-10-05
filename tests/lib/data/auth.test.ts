// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { auth, getSessionUser, requireAdmin, requireUser } from '@/lib/data/auth'
import { db } from '@/lib/data/db'
import { ForbiddenError, UnauthorizedError } from '@/lib/data/errors'
import { cookieJar } from '../../helpers/cookies'
import { createUser, resetDatabase, signInAs, TEST_PASSWORD } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

describe('DAL auth', () => {
  beforeEach(resetDatabase)
  afterAll(() => db.$disconnect())

  it('treats a request without a session as signed out', async () => {
    expect(await getSessionUser()).toBeNull()
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('treats a forged cookie as signed out', async () => {
    cookieJar.set('better-auth.session_token', 'forged.value')
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('returns the signed-in user id and role', async () => {
    const user = await createUser({})
    await signInAs(user)
    expect(cookieJar.size).toBeGreaterThan(0)
    expect(await requireUser()).toEqual({ id: user.id, role: 'user' })
  })

  it('only lets admins through requireAdmin', async () => {
    const member = await createUser({})
    await signInAs(member)
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError)

    const admin = await createUser({ role: 'admin' })
    await signInAs(admin)
    expect(await requireAdmin()).toEqual({ id: admin.id, role: 'admin' })
  })

  describe("Better Auth's HTTP router", () => {
    const post = (path: string, body: unknown, cookie?: string) =>
      auth.handler(
        new Request(`http://localhost:3000/api/auth${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://localhost:3000',
            ...(cookie ? { cookie } : {}),
          },
          body: JSON.stringify(body),
        }),
      )

    it('does not expose sign-up, so our validation cannot be bypassed', async () => {
      const response = await post('/sign-up/email', {
        name: '',
        username: 'A!',
        email: 'x@example.com',
        password: 'long-enough-1',
      })
      expect(response.status).toBe(404)
      expect(await db.user.count()).toBe(0)
    })

    it('does not expose update-user, so usernames cannot be changed around our rules', async () => {
      const user = await createUser({ username: 'original' })
      await signInAs(user)
      const response = await post(
        '/update-user',
        { name: 'Hacked' },
        requestHeaders().get('cookie')!,
      )
      expect(response.status).toBe(404)
      expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
        name: user.name,
        username: 'original',
      })
    })

    it('still serves sign-in', async () => {
      const user = await createUser({})
      const response = await post('/sign-in/email', { email: user.email, password: TEST_PASSWORD })
      expect(response.status).toBe(200)
    })
  })
})
