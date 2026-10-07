// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { jobs, type JobPayload } from '@/jobs/definitions'
import { auth, getSessionUser, requireAdmin, requireUser } from '@/lib/data/auth'
import { db } from '@/lib/data/db'
import { ForbiddenError, UnauthorizedError } from '@/lib/data/errors'
import { getViewer } from '@/lib/data/users'
import { enqueue } from '@/lib/server/queue'
import { getRedis } from '@/lib/server/redis'
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
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

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
    const session = await db.session.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(await requireUser()).toEqual({ id: user.id, role: 'user', sessionId: session.id })
  })

  it('only lets admins through requireAdmin', async () => {
    const member = await createUser({})
    await signInAs(member)
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError)

    const admin = await createUser({ role: 'admin' })
    await signInAs(admin)
    expect(await requireAdmin()).toMatchObject({ id: admin.id, role: 'admin' })
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

    it('does not expose delete-user, so an account cannot be deleted without our password check', async () => {
      const user = await createUser({})
      await signInAs(user)
      const response = await post('/delete-user', {}, requestHeaders().get('cookie')!)
      expect(response.status).toBe(404)
      expect(await db.user.count({ where: { id: user.id } })).toBe(1)
    })

    it('does not expose the delete-user callback either', async () => {
      const response = await auth.handler(
        new Request('http://localhost:3000/api/auth/delete-user/callback?token=x', {
          method: 'GET',
          headers: { origin: 'http://localhost:3000' },
        }),
      )
      expect(response.status).toBe(404)
    })

    it('still serves change-password and change-email (same rules as the actions)', async () => {
      const user = await createUser({})
      await signInAs(user)
      const cookie = requestHeaders().get('cookie')!
      const password = await post(
        '/change-password',
        { currentPassword: TEST_PASSWORD, newPassword: 'another-long-one' },
        cookie,
      )
      expect(password.status).toBe(200)
      const email = await post('/change-email', { newEmail: 'moved@example.com' }, cookie)
      expect(email.status).toBe(200)
    })

    it('still serves sign-in', async () => {
      const user = await createUser({})
      const response = await post('/sign-in/email', { email: user.email, password: TEST_PASSWORD })
      expect(response.status).toBe(200)
    })
  })

  describe('changing the email', () => {
    const sentEmails = () =>
      vi
        .mocked(enqueue)
        .mock.calls.filter(([name]) => name === 'send-email')
        .map(([, payload]) => payload as JobPayload<'send-email'>)

    const tokenOf = (url: string) => String(new URL(url).searchParams.get('token'))

    it('asks the current address to confirm, then verifies the new one, then switches', async () => {
      const user = await createUser({ email: 'old@example.com' })
      await db.user.update({ where: { id: user.id }, data: { emailVerified: true } })
      await signInAs(user)
      vi.mocked(enqueue).mockClear()

      await auth.api.changeEmail({
        body: { newEmail: 'New@Example.com', callbackURL: '/settings' },
        headers: requestHeaders(),
      })
      const [confirmation, ...rest] = sentEmails()
      expect(rest).toEqual([])
      expect(confirmation).toMatchObject({
        template: 'confirm-email-change',
        to: 'old@example.com',
        props: { name: user.name, newEmail: 'new@example.com' },
      })
      expect(() => jobs['send-email'].schema.parse(confirmation)).not.toThrow()
      expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
        email: 'old@example.com',
      })

      vi.mocked(enqueue).mockClear()
      await auth.api
        .verifyEmail({
          query: { token: tokenOf(confirmation.props.url!), callbackURL: '/settings' },
          headers: requestHeaders(),
        })
        .catch(() => {})
      const [verification] = sentEmails()
      expect(verification).toMatchObject({ template: 'verify-email', to: 'new@example.com' })
      expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
        email: 'old@example.com',
      })

      await auth.api
        .verifyEmail({
          query: { token: tokenOf(verification.props.url), callbackURL: '/settings' },
          headers: requestHeaders(),
        })
        .catch(() => {})
      expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
        email: 'new@example.com',
        emailVerified: true,
      })
      expect((await getViewer())?.email).toBe('new@example.com')
    })

    it('verifies the new address directly when the current one was never verified', async () => {
      const user = await createUser({ email: 'old@example.com' })
      await signInAs(user)
      vi.mocked(enqueue).mockClear()

      await auth.api.changeEmail({
        body: { newEmail: 'new@example.com', callbackURL: '/settings' },
        headers: requestHeaders(),
      })
      expect(sentEmails()).toEqual([
        expect.objectContaining({ template: 'verify-email', to: 'new@example.com' }),
      ])
    })

    it('answers the same and sends nothing when the new address belongs to someone else', async () => {
      const user = await createUser({ email: 'old@example.com' })
      await createUser({ email: 'taken@example.com' })
      await db.user.update({ where: { id: user.id }, data: { emailVerified: true } })
      await signInAs(user)
      vi.mocked(enqueue).mockClear()

      const result = await auth.api.changeEmail({
        body: { newEmail: 'taken@example.com', callbackURL: '/settings' },
        headers: requestHeaders(),
      })
      expect(result).toEqual({ status: true })
      expect(sentEmails()).toEqual([])
    })
  })

  describe('deleting the account', () => {
    it('removes the user with their posts and sessions, and queues their uploads for deletion', async () => {
      const user = await createUser({})
      const other = await createUser({})
      await db.post.create({ data: { userId: user.id, title: 'Mine', body: 'b' } })
      await db.post.create({ data: { userId: other.id, title: 'Theirs', body: 'b' } })
      await db.upload.createMany({
        data: [
          {
            key: 'avatars/a/1',
            userId: user.id,
            purpose: 'avatar',
            contentType: 'image/png',
            size: 1,
          },
          {
            key: 'avatars/a/2',
            userId: user.id,
            purpose: 'avatar',
            contentType: 'image/png',
            size: 1,
          },
          {
            key: 'avatars/b/1',
            userId: other.id,
            purpose: 'avatar',
            contentType: 'image/png',
            size: 1,
          },
        ],
      })
      await signInAs(user)
      vi.mocked(enqueue).mockClear()

      await auth.api.deleteUser({ body: { password: TEST_PASSWORD }, headers: requestHeaders() })

      expect(await db.user.count({ where: { id: user.id } })).toBe(0)
      expect(await db.post.findMany({ select: { title: true } })).toEqual([{ title: 'Theirs' }])
      expect(await db.session.count({ where: { userId: user.id } })).toBe(0)
      const deleted = vi
        .mocked(enqueue)
        .mock.calls.filter(([name]) => name === 'delete-object')
        .map(([, payload]) => (payload as { key: string }).key)
        .sort()
      expect(deleted).toEqual(['avatars/a/1', 'avatars/a/2'])
    })

    it('drops the cached post lists and viewer', async () => {
      const { listPosts } = await import('@/lib/data/posts')
      const user = await createUser({})
      await db.post.create({
        data: { userId: user.id, title: 'Soon gone', body: 'b', status: 'published' },
      })
      await signInAs(user)
      expect((await listPosts({ page: 1, perPage: 10 })).totalItems).toBe(1)
      expect(await getViewer()).not.toBeNull()

      await auth.api.deleteUser({ body: { password: TEST_PASSWORD }, headers: requestHeaders() })

      expect((await listPosts({ page: 1, perPage: 10 })).totalItems).toBe(0)
    })

    it('refuses a wrong password and keeps the account', async () => {
      const user = await createUser({})
      await signInAs(user)
      await expect(
        auth.api.deleteUser({ body: { password: 'not-the-password' }, headers: requestHeaders() }),
      ).rejects.toMatchObject({ body: { code: 'INVALID_PASSWORD' } })
      expect(await db.user.count({ where: { id: user.id } })).toBe(1)
    })
  })

  describe('configuration', () => {
    it('does not sign the browser in when a verification link is opened', () => {
      expect(auth.options.emailVerification?.autoSignInAfterVerification).toBe(false)
    })
  })
})
