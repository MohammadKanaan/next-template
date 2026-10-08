// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { jobs, type JobPayload } from '@/jobs/definitions'
import { auth, getSessionUser, requireAdmin, requireUser } from '@/lib/data/auth'
import { db } from '@/lib/data/db'
import { ForbiddenError, UnauthorizedError } from '@/lib/data/errors'
import { getViewer } from '@/lib/data/users'
import { MAX_OBJECT_DELETE_DELAY_SECONDS } from '@/lib/dto/uploads'
import { enqueue } from '@/lib/server/queue'
import { getRedis } from '@/lib/server/redis'
import { cookieJar } from '../../helpers/cookies'
import { createUser, resetDatabase, signInAs, signOut, TEST_PASSWORD } from '../../helpers/server'

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

    it('does not expose change-password, change-email or verify-password; the actions limit them per user', async () => {
      const user = await createUser({})
      await signInAs(user)
      const cookie = requestHeaders().get('cookie')!
      const password = await post(
        '/change-password',
        { currentPassword: TEST_PASSWORD, newPassword: 'another-long-one' },
        cookie,
      )
      const email = await post('/change-email', { newEmail: 'moved@example.com' }, cookie)
      const verify = await post('/verify-password', { password: TEST_PASSWORD }, cookie)
      expect(password.status).toBe(404)
      expect(email.status).toBe(404)
      expect(verify.status).toBe(404)
      // The actions reach Better Auth through `auth.api`, which `disabledPaths` does not affect.
      const direct = await auth.api.changePassword({
        body: { currentPassword: TEST_PASSWORD, newPassword: 'another-long-one' },
        headers: requestHeaders(),
      })
      expect(direct.user.id).toBe(user.id)
    })

    it('does not expose sign-in, so the per-account limit in signInAction cannot be skipped', async () => {
      const user = await createUser({})
      const response = await post('/sign-in/email', { email: user.email, password: TEST_PASSWORD })
      expect(response.status).toBe(404)
      expect(response.headers.get('set-cookie')).toBeNull()
      // The action reaches Better Auth through `auth.api`, which `disabledPaths` does not affect.
      const direct = await auth.api.signInEmail({
        body: { email: user.email, password: TEST_PASSWORD },
      })
      expect(direct.user.id).toBe(user.id)
    })

    it('does not expose password-reset or verification-email requests', async () => {
      const user = await createUser({})
      vi.mocked(enqueue).mockClear()
      const reset = await post('/request-password-reset', { email: user.email })
      const verification = await post('/send-verification-email', { email: user.email })
      expect(reset.status).toBe(404)
      expect(verification.status).toBe(404)
      expect(enqueue).not.toHaveBeenCalled()
      // Direct calls (what the actions use) still work.
      await auth.api.requestPasswordReset({ body: { email: user.email } })
      await auth.api.sendVerificationEmail({ body: { email: user.email } })
      expect(enqueue).toHaveBeenCalledTimes(2)
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
      const jobs = vi.mocked(enqueue).mock.calls.filter(([name]) => name === 'delete-object')
      const deleted = jobs.map(([, payload]) => (payload as { key: string }).key).sort()
      expect(deleted).toEqual(['avatars/a/1', 'avatars/a/2'])
      // Delayed past every ticket's lifetime, so an upload still in flight cannot be orphaned.
      for (const [, , options] of jobs) {
        expect(options).toEqual({
          startAfter: MAX_OBJECT_DELETE_DELAY_SECONDS,
        })
      }
    })

    it('also queues and removes the files other people attached to their posts', async () => {
      const user = await createUser({})
      const admin = await createUser({ role: 'admin' })
      const mine = await db.post.create({ data: { userId: user.id, title: 'Mine', body: 'b' } })
      const theirs = await db.post.create({
        data: { userId: admin.id, title: 'Theirs', body: 'b' },
      })
      const attach = (key: string, postId: number) =>
        db.upload.create({
          data: {
            key,
            userId: admin.id,
            postId,
            purpose: 'attachment',
            name: 'f.pdf',
            contentType: 'application/pdf',
            size: 1,
            status: 'attached',
          },
        })
      await attach('attachments/admin/on-mine', mine.id)
      await attach('attachments/admin/on-theirs', theirs.id)
      await signInAs(user)
      vi.mocked(enqueue).mockClear()

      await auth.api.deleteUser({ body: { password: TEST_PASSWORD }, headers: requestHeaders() })

      const jobs = vi.mocked(enqueue).mock.calls.filter(([name]) => name === 'delete-object')
      expect(jobs.map(([, payload]) => (payload as { key: string }).key)).toEqual([
        'attachments/admin/on-mine',
      ])
      expect((await db.upload.findMany()).map((row) => row.key)).toEqual([
        'attachments/admin/on-theirs',
      ])
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

  describe('change-email verification link', () => {
    // An unverified account skips the confirmation step, so the first mail is the verification of
    // the new address, the one that used to create a session for whoever opened it.
    const requestChangeEmail = async (newEmail: string) => {
      const user = await createUser({ email: 'old@example.com' })
      await signInAs(user)
      vi.mocked(enqueue).mockClear()
      await auth.api.changeEmail({
        body: { newEmail, callbackURL: '/settings' },
        headers: requestHeaders(),
      })
      const verification = vi
        .mocked(enqueue)
        .mock.calls.map(([, payload]) => payload as JobPayload<'send-email'>)
        .find((payload) => payload.template === 'verify-email')
      const url = new URL(verification!.props.url)
      return { user, token: String(url.searchParams.get('token')) }
    }

    const emailOf = async (id: string) => (await db.user.findUniqueOrThrow({ where: { id } })).email

    it("does not sign a cookieless opener in; the link completes only with the account's session", async () => {
      const { user, token } = await requestChangeEmail('new@example.com')
      const sessions = await db.session.count({ where: { userId: user.id } })

      signOut()
      const opened = await auth.api
        .verifyEmail({ query: { token, callbackURL: '/settings' }, headers: requestHeaders() })
        .catch((error: unknown) => error)
      expect(opened).toMatchObject({ statusCode: 302 })
      const location = String((opened as { headers: Headers }).headers.get('location'))
      expect(location.startsWith('/login?next=')).toBe(true)
      expect(new URL(location, 'http://localhost:3000').searchParams.get('next')).toBe(
        `/api/auth/verify-email?token=${token}&callbackURL=%2Fsettings`,
      )
      expect(cookieJar.size).toBe(0)
      expect(await db.session.count({ where: { userId: user.id } })).toBe(sessions)
      expect(await emailOf(user.id)).toBe('old@example.com')

      await signInAs(user)
      await auth.api
        .verifyEmail({ query: { token, callbackURL: '/settings' }, headers: requestHeaders() })
        .catch(() => {})
      expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
        email: 'new@example.com',
        emailVerified: true,
      })
    })

    it('redirects the same way through the HTTP router, and lets the session holder through', async () => {
      const { user, token } = await requestChangeEmail('new@example.com')
      const open = (cookie?: string) =>
        auth.handler(
          new Request(`http://localhost:3000/api/auth/verify-email?token=${token}`, {
            headers: cookie ? { cookie } : {},
          }),
        )

      const anonymous = await open()
      expect(anonymous.status).toBe(302)
      expect(anonymous.headers.get('location')).toMatch(/^\/login\?next=/)
      expect(anonymous.headers.get('set-cookie')).toBeNull()
      expect(await emailOf(user.id)).toBe('old@example.com')

      const owner = await open(requestHeaders().get('cookie')!)
      expect(owner.status).toBe(200)
      expect(await emailOf(user.id)).toBe('new@example.com')
    })

    it('leaves the plain verification link alone', async () => {
      const user = await createUser({ email: 'plain@example.com' })
      signOut()
      vi.mocked(enqueue).mockClear()
      await auth.api.sendVerificationEmail({ body: { email: user.email } })
      const { props } = vi.mocked(enqueue).mock.calls[0][1] as JobPayload<'send-email'>
      await auth.api.verifyEmail({
        query: { token: String(new URL(props.url!).searchParams.get('token')) },
        headers: requestHeaders(),
      })
      expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
        emailVerified: true,
      })
      expect(cookieJar.size).toBe(0)
    })
  })

  describe('configuration', () => {
    it('does not sign the browser in when a verification link is opened', () => {
      expect(auth.options.emailVerification?.autoSignInAfterVerification).toBe(false)
    })
  })
})
