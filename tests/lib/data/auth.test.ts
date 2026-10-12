// @vitest-environment node
import { APIError } from 'better-auth/api'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { auth, getSessionUser, requireAdmin, requireUser, toRole } from '@/lib/data/auth'
import { db } from '@/lib/data/db'
import { ForbiddenError, UnauthorizedError } from '@/lib/data/errors'
import { listPosts } from '@/lib/data/posts'
import { getViewer } from '@/lib/data/users'
import { MAX_OBJECT_DELETE_DELAY_SECONDS } from '@/lib/dto/uploads'
import { enqueue } from '@/lib/server/queue'
import { getRedis } from '@/lib/server/redis'
import { cookieJar } from '../../helpers/cookies'
import {
  clearMail,
  flushMail,
  linkOf,
  sentMails,
  sentMailsWithSubject,
  tokenOf,
} from '../../helpers/mail'
import { createUser, resetDatabase, signInAs, signOut, TEST_PASSWORD } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

const currentSessionOf = (userId: string) =>
  db.session.findFirstOrThrow({ where: { userId }, orderBy: { createdAt: 'desc' } })

describe('DAL auth', () => {
  beforeEach(async () => {
    await resetDatabase()
    clearMail()
  })
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

  it('returns the signed-in user id, role and session, with no impersonator', async () => {
    const user = await createUser({})
    await signInAs(user)
    expect(cookieJar.size).toBeGreaterThan(0)
    const session = await currentSessionOf(user.id)
    expect(await requireUser()).toEqual({
      id: user.id,
      role: 'user',
      sessionId: session.id,
      impersonatedBy: null,
    })
  })

  it('only lets admins through requireAdmin', async () => {
    const member = await createUser({})
    await signInAs(member)
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError)

    const admin = await createUser({ role: 'admin' })
    await signInAs(admin)
    expect(await requireAdmin()).toMatchObject({ id: admin.id, role: 'admin' })
  })

  it('reads a role it does not know as a regular user, so an odd value never grants more', () => {
    expect(toRole('owner')).toBe('user')
    // The plugin allows comma-separated role lists; a list is not one of ours either.
    expect(toRole('admin,user')).toBe('user')
    expect(toRole(null)).toBe('user')
    expect(toRole('admin')).toBe('admin')
  })

  it('keeps odd roles out of the table altogether (users_role_valid)', async () => {
    const user = await createUser({})
    await expect(
      db.user.update({ where: { id: user.id }, data: { role: 'owner' } }),
    ).rejects.toThrow()
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('user')
  })

  it('exposes the admin behind an impersonated session', async () => {
    const user = await createUser({})
    const admin = await createUser({ role: 'admin' })
    await signInAs(user)
    const session = await currentSessionOf(user.id)
    await db.session.update({ where: { id: session.id }, data: { impersonatedBy: admin.id } })
    expect(await getSessionUser()).toEqual({
      id: user.id,
      role: 'user',
      sessionId: session.id,
      impersonatedBy: admin.id,
    })
  })

  describe('a banned user', () => {
    it('cannot sign in, and their sessions are gone', async () => {
      const user = await createUser({})
      const other = await createUser({})
      await signInAs(user)
      await expect(requireUser()).resolves.toMatchObject({ id: user.id })
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)

      await auth.api.banUser({
        body: { userId: user.id, banReason: 'Spam' },
        headers: requestHeaders(),
      })

      expect(await db.session.count({ where: { userId: user.id } })).toBe(0)
      // The ban does not reach anyone else's sessions.
      expect(await db.session.count({ where: { userId: other.id } })).toBeGreaterThan(0)
      expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
        banned: true,
        banReason: 'Spam',
      })

      signOut()
      const refused = await auth.api
        .signInEmail({ body: { email: user.email, password: TEST_PASSWORD } })
        .catch((error: unknown) => error)
      expect(refused).toBeInstanceOf(APIError)
      expect(refused).toMatchObject({
        status: 'FORBIDDEN',
        body: { code: 'BANNED_USER', message: 'Your account is banned: Spam' },
      })
      expect(cookieJar.size).toBe(0)
      await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError)
    })

    it('can sign in again once unbanned', async () => {
      const user = await createUser({})
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await auth.api.banUser({ body: { userId: user.id }, headers: requestHeaders() })
      await auth.api.unbanUser({ body: { userId: user.id }, headers: requestHeaders() })

      await signInAs(user)
      await expect(requireUser()).resolves.toMatchObject({ id: user.id })
    })
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
      clearMail()
      const reset = await post('/request-password-reset', { email: user.email })
      const verification = await post('/send-verification-email', { email: user.email })
      expect(reset.status).toBe(404)
      expect(verification.status).toBe(404)
      await flushMail()
      expect(sentMails()).toEqual([])
      // Direct calls (what the actions use) still work.
      await auth.api.requestPasswordReset({ body: { email: user.email } })
      await auth.api.sendVerificationEmail({ body: { email: user.email } })
      await flushMail()
      expect(
        sentMails()
          .map((mail) => mail.subject)
          .sort(),
      ).toEqual(['Reset your password', 'Verify your email'])
    })

    it('does not expose the admin plugin routes, even to a signed-in admin', async () => {
      const target = await createUser({})
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      const cookie = requestHeaders().get('cookie')!

      const setRole = await post('/admin/set-role', { userId: target.id, role: 'admin' }, cookie)
      const ban = await post('/admin/ban-user', { userId: target.id }, cookie)
      const impersonate = await post('/admin/impersonate-user', { userId: target.id }, cookie)
      const list = await auth.handler(
        new Request('http://localhost:3000/api/auth/admin/list-users?limit=10', {
          headers: { cookie, origin: 'http://localhost:3000' },
        }),
      )
      expect([setRole.status, ban.status, impersonate.status, list.status]).toEqual([
        404, 404, 404, 404,
      ])
      expect(impersonate.headers.get('set-cookie')).toBeNull()
      expect(await db.user.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({
        role: 'user',
        banned: false,
      })
      expect(await db.session.count({ where: { userId: target.id } })).toBeGreaterThan(0)
      // The DAL reaches the same operations through `auth.api`, which `disabledPaths` does not affect.
      const direct = await auth.api.setRole({
        body: { userId: target.id, role: 'admin' },
        headers: requestHeaders(),
      })
      expect(direct.user.id).toBe(target.id)
    })
  })

  describe('changing the email', () => {
    const emailOf = async (id: string) => (await db.user.findUniqueOrThrow({ where: { id } })).email

    it('asks the current address to confirm, then verifies the new one, then switches', async () => {
      const user = await createUser({ email: 'old@example.com' })
      await db.user.update({ where: { id: user.id }, data: { emailVerified: true } })
      await signInAs(user)
      clearMail()

      await auth.api.changeEmail({
        body: { newEmail: 'New@Example.com', callbackURL: '/settings' },
        headers: requestHeaders(),
      })
      await flushMail()
      const [confirmation, ...rest] = sentMails()
      expect(rest).toEqual([])
      expect(confirmation).toMatchObject({
        subject: 'Confirm your email change',
        to: 'old@example.com',
      })
      expect(confirmation.text).toContain(user.name)
      expect(confirmation.text).toContain('new@example.com')
      expect(await emailOf(user.id)).toBe('old@example.com')

      clearMail()
      await auth.api
        .verifyEmail({
          query: { token: tokenOf(confirmation), callbackURL: '/settings' },
          headers: requestHeaders(),
        })
        .catch(() => {})
      await flushMail()
      const [verification] = sentMails()
      expect(verification).toMatchObject({ subject: 'Verify your email', to: 'new@example.com' })
      expect(await emailOf(user.id)).toBe('old@example.com')

      await auth.api
        .verifyEmail({
          query: { token: tokenOf(verification), callbackURL: '/settings' },
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
      clearMail()

      await auth.api.changeEmail({
        body: { newEmail: 'new@example.com', callbackURL: '/settings' },
        headers: requestHeaders(),
      })
      await flushMail()
      expect(sentMails()).toEqual([
        expect.objectContaining({ subject: 'Verify your email', to: 'new@example.com' }),
      ])
    })

    it('answers the same and sends nothing when the new address belongs to someone else', async () => {
      const user = await createUser({ email: 'old@example.com' })
      await createUser({ email: 'taken@example.com' })
      await db.user.update({ where: { id: user.id }, data: { emailVerified: true } })
      await signInAs(user)
      clearMail()

      const result = await auth.api.changeEmail({
        body: { newEmail: 'taken@example.com', callbackURL: '/settings' },
        headers: requestHeaders(),
      })
      expect(result).toEqual({ status: true })
      await flushMail()
      expect(sentMails()).toEqual([])
    })
  })

  describe('deleting the account', () => {
    it('removes the user with their posts and sessions, and nobody else’s', async () => {
      const user = await createUser({})
      const other = await createUser({})
      await db.post.create({ data: { userId: user.id, title: 'Mine', body: 'b' } })
      await db.post.create({ data: { userId: other.id, title: 'Theirs', body: 'b' } })
      await signInAs(user)

      await auth.api.deleteUser({ body: { password: TEST_PASSWORD }, headers: requestHeaders() })

      expect(await db.user.count({ where: { id: user.id } })).toBe(0)
      expect(await db.user.count({ where: { id: other.id } })).toBe(1)
      expect(await db.post.findMany({ select: { title: true } })).toEqual([{ title: 'Theirs' }])
      expect(await db.session.count({ where: { userId: user.id } })).toBe(0)
      expect(await db.account.count({ where: { userId: user.id } })).toBe(0)
      await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError)
    })

    it('drops the cached post lists and viewer', async () => {
      const user = await createUser({})
      await db.post.create({
        data: { userId: user.id, title: 'Soon gone', body: 'b', published: true },
      })
      await signInAs(user)
      expect((await listPosts({ page: 1, perPage: 10 })).totalItems).toBe(1)
      expect(await getViewer()).not.toBeNull()

      await auth.api.deleteUser({ body: { password: TEST_PASSWORD }, headers: requestHeaders() })

      expect((await listPosts({ page: 1, perPage: 10 })).totalItems).toBe(0)
      expect(await getViewer()).toBeNull()
    })

    it("queues the user's upload objects for deletion, delayed past every ticket's lifetime", async () => {
      const user = await createUser({})
      const other = await createUser({})
      const upload = (userId: string, key: string, status: 'pending' | 'attached') =>
        db.upload.create({
          data: { userId, key, purpose: 'avatar', contentType: 'image/png', size: 1, status },
        })
      await upload(user.id, `avatars/${user.id}/old`, 'attached')
      await upload(user.id, `avatars/${user.id}/half`, 'pending')
      await upload(other.id, `avatars/${other.id}/keep`, 'attached')
      await signInAs(user)
      vi.mocked(enqueue).mockClear()

      await auth.api.deleteUser({ body: { password: TEST_PASSWORD }, headers: requestHeaders() })

      const deletes = vi.mocked(enqueue).mock.calls.filter(([name]) => name === 'delete-object')
      const keys = deletes.map(([, payload]) => ('key' in payload ? payload.key : null)).sort()
      expect(keys).toEqual([`avatars/${user.id}/half`, `avatars/${user.id}/old`])
      for (const [, , options] of deletes) {
        expect(options).toEqual({ startAfter: MAX_OBJECT_DELETE_DELAY_SECONDS })
      }
      expect(await db.upload.count()).toBe(1)
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
      clearMail()
      await auth.api.changeEmail({
        body: { newEmail, callbackURL: '/settings' },
        headers: requestHeaders(),
      })
      await flushMail()
      const [verification] = sentMailsWithSubject('Verify your email')
      return { user, token: tokenOf(verification) }
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
      clearMail()
      await auth.api.sendVerificationEmail({ body: { email: user.email } })
      await flushMail()
      const [mail] = sentMailsWithSubject('Verify your email')
      expect(mail.to).toBe('plain@example.com')
      expect(new URL(linkOf(mail)).pathname).toBe('/api/auth/verify-email')
      await auth.api.verifyEmail({ query: { token: tokenOf(mail) }, headers: requestHeaders() })
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
