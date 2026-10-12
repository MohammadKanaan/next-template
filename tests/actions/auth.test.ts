// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { APIError } from 'better-auth/api'
import { refresh } from 'next/cache'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  changeEmailAction,
  changePasswordAction,
  deleteAccountAction,
  requestPasswordResetAction,
  resendVerificationAction,
  resetPasswordAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  signInAction,
  signOutAction,
  signUpAction,
} from '@/actions/auth'
import { auth, requireUser } from '@/lib/data/auth'
import { db } from '@/lib/data/db'
import { UnauthorizedError } from '@/lib/data/errors'
import { isUsernameTaken } from '@/lib/data/users'
import { cookieJar } from '../helpers/cookies'
import {
  clearMail,
  flushMail,
  linkOf,
  sentMails,
  sentMailsWithSubject,
  tokenOf,
} from '../helpers/mail'
import { createUser, resetDatabase, resetRedis, signInAs, TEST_PASSWORD } from '../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(async () => import('../helpers/cookies'))
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))
// Real by default; one test makes the sign-up's own check miss a taken username, as a race would.
vi.mock('@/lib/data/users', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data/users')>()
  return { ...actual, isUsernameTaken: vi.fn(actual.isUsernameTaken) }
})

const newUser = {
  name: 'New',
  username: 'newbie',
  email: 'New@Example.com',
  password: 'long-enough-1',
}

describe('auth actions', () => {
  beforeEach(async () => {
    await resetDatabase()
    vi.mocked(refresh).mockClear()
    clearMail()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  afterAll(() => db.$disconnect())

  it('signs up, signs in, and stores a normalised email with the default role', async () => {
    expect(await signUpAction(newUser)).toEqual({ ok: true, data: null })
    await expect(requireUser()).resolves.toBeDefined()
    const stored = await db.user.findFirstOrThrow()
    expect(stored).toMatchObject({ email: 'new@example.com', role: 'user', banned: false })
  })

  it('rejects a taken username', async () => {
    await createUser({ username: 'taken' })
    expect(await signUpAction({ ...newUser, username: 'taken' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { username: ['That username is taken'] },
    })
  })

  it('reports a username taken between its check and the insert as the same field error', async () => {
    await createUser({ username: 'taken' })
    vi.mocked(isUsernameTaken).mockResolvedValueOnce(false)
    expect(await signUpAction({ ...newUser, username: 'taken' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { username: ['That username is taken'] },
    })
    expect(await db.user.count({ where: { email: 'new@example.com' } })).toBe(0)
  })

  it('rejects a taken email', async () => {
    await createUser({ email: 'new@example.com' })
    expect(await signUpAction(newUser)).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { email: ['An account with this email already exists'] },
    })
  })

  it('rejects a short password without creating a user', async () => {
    const result = await signUpAction({ ...newUser, password: 'short' })
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(!result.ok && result.fieldErrors?.password).toHaveLength(1)
    expect(await db.user.count()).toBe(0)
  })

  it('reports a wrong password without starting a session', async () => {
    const user = await createUser({})
    expect(await signInAction({ email: user.email, password: 'wrong-password' })).toEqual({
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'Invalid email or password',
    })
    expect(cookieJar.size).toBe(0)
  })

  it('signs in with a mixed-case email', async () => {
    const user = await createUser({ email: 'mixed@example.com' })
    expect(await signInAction({ email: 'Mixed@Example.com', password: TEST_PASSWORD })).toEqual({
      ok: true,
      data: null,
    })
    await expect(requireUser()).resolves.toMatchObject({ id: user.id })
  })

  it('refuses a banned user with the reason and starts no session', async () => {
    const user = await createUser({})
    const silent = await createUser({})
    const admin = await createUser({ role: 'admin' })
    await signInAs(admin)
    await auth.api.banUser({
      body: { userId: user.id, banReason: 'Spam' },
      headers: requestHeaders(),
    })
    await auth.api.banUser({ body: { userId: silent.id }, headers: requestHeaders() })
    cookieJar.clear()
    expect(await signInAction({ email: user.email, password: TEST_PASSWORD })).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      message: 'Your account is banned: Spam',
    })
    expect(await signInAction({ email: silent.email, password: TEST_PASSWORD })).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      message: 'Your account is banned: no reason given',
    })
    expect(cookieJar.size).toBe(0)
    expect(refresh).not.toHaveBeenCalled()
    // A wrong password is still the generic answer, so the ban is not a way to find out passwords.
    expect(await signInAction({ email: user.email, password: 'wrong-password' })).toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Invalid email or password',
    })
  })

  it('signs out and deletes the session row', async () => {
    const user = await createUser({})
    // createUser's own sign-up session row is not under test.
    await db.session.deleteMany()
    await signInAs(user)
    expect(await db.session.count()).toBe(1)
    expect(await signOutAction()).toEqual({ ok: true, data: null })
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError)
    expect(await db.session.count()).toBe(0)
  })

  it('refreshes the router once per successful sign-in, sign-up, and sign-out', async () => {
    const user = await createUser({ email: 'a@example.com' })
    await signUpAction(newUser)
    expect(refresh).toHaveBeenCalledTimes(1)
    await signOutAction()
    expect(refresh).toHaveBeenCalledTimes(2)
    await signInAction({ email: user.email, password: TEST_PASSWORD })
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('maps an unexpected Better Auth error on sign-up to a form-level failure', async () => {
    vi.spyOn(auth.api, 'signUpEmail').mockRejectedValue(
      new APIError('UNPROCESSABLE_ENTITY', { code: 'FAILED_TO_CREATE_USER', message: 'x' }),
    )
    expect(await signUpAction(newUser)).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Could not create your account. Try again.',
    })
  })

  it('maps an unexpected Better Auth error on sign-in to a form-level failure', async () => {
    vi.spyOn(auth.api, 'signInEmail').mockRejectedValue(
      new APIError('INTERNAL_SERVER_ERROR', { code: 'FAILED_TO_CREATE_SESSION', message: 'x' }),
    )
    expect(await signInAction({ email: 'a@example.com', password: 'whatever1' })).toEqual({
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'Could not sign you in. Try again.',
    })
  })

  it('still rethrows errors that are not Better Auth API errors', async () => {
    vi.spyOn(auth.api, 'signInEmail').mockRejectedValue(new Error('database down'))
    await expect(signInAction({ email: 'a@example.com', password: 'whatever1' })).rejects.toThrow(
      'database down',
    )
  })

  it('rate limits sign-in per email in production only', async () => {
    const attempt = () => signInAction({ email: 'victim@example.com', password: 'wrong-password' })
    for (let n = 0; n < 7; n++) {
      expect(await attempt()).toMatchObject({ code: 'UNAUTHORIZED' })
    }

    await resetRedis()
    vi.stubEnv('NODE_ENV', 'production')
    for (let n = 0; n < 5; n++) {
      expect(await attempt()).toMatchObject({ message: 'Invalid email or password' })
    }
    expect(await attempt()).toEqual({
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Try again in a minute.',
    })
  })

  it('rate limits sign-up per IP in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    for (let n = 0; n < 5; n++) {
      expect(
        await signUpAction({ ...newUser, email: `u${n}@example.com`, username: `user${n}` }),
      ).toMatchObject({ ok: true })
    }
    expect(
      await signUpAction({ ...newUser, email: 'u6@example.com', username: 'user6' }),
    ).toMatchObject({
      ok: false,
      code: 'RATE_LIMITED',
    })
  })

  describe('emails', () => {
    /** The last mail sent with `subject`, once Better Auth's un-awaited send has landed. */
    const lastMail = async (subject: string) => {
      await flushMail()
      const mail = sentMailsWithSubject(subject).at(-1)
      if (!mail) {
        throw new Error(`No email "${subject}" was sent`)
      }
      return mail
    }

    /** Reset links carry the token in the path (`/reset-password/<token>`). */
    const tokenInPath = (mail: Awaited<ReturnType<typeof lastMail>>) =>
      new URL(linkOf(mail)).pathname.split('/').pop()!

    it('sends a verification email on sign-up and leaves the user unverified', async () => {
      expect(await signUpAction(newUser)).toEqual({ ok: true, data: null })
      const mail = await lastMail('Verify your email')
      expect(mail.to).toBe('new@example.com')
      expect(mail.text).toContain('New')
      expect(linkOf(mail)).toContain('/verify-email?token=')
      expect(await db.user.findFirstOrThrow()).toMatchObject({ emailVerified: false })
    })

    it('sends each mail once, to the account’s address, with its link in both bodies', async () => {
      await signUpAction(newUser)
      await requestPasswordResetAction({ email: newUser.email })
      await flushMail()
      expect(
        sentMails()
          .map((mail) => mail.subject)
          .sort(),
      ).toEqual(['Reset your password', 'Verify your email'])
      for (const mail of sentMails()) {
        expect(mail.to).toBe('new@example.com')
        // The HTML twin carries the same link, with `&` escaped as HTML wants it.
        expect(mail.html).toContain(linkOf(mail).replaceAll('&', '&amp;'))
      }
    })

    it('answers ok for an unknown email without sending anything', async () => {
      expect(await requestPasswordResetAction({ email: 'ghost@example.com' })).toEqual({
        ok: true,
        data: null,
      })
      await flushMail()
      expect(sentMails()).toEqual([])
    })

    it('sends a reset email for a known address', async () => {
      const user = await createUser({ email: 'ada@example.com' })
      clearMail()
      expect(await requestPasswordResetAction({ email: 'Ada@Example.com' })).toEqual({
        ok: true,
        data: null,
      })
      const mail = await lastMail('Reset your password')
      expect(mail.to).toBe(user.email)
      expect(mail.text).toContain(user.name)
      expect(linkOf(mail)).toContain('/reset-password/')
    })

    it('rejects a malformed email on the reset request', async () => {
      expect(await requestPasswordResetAction({ email: 'nope' })).toMatchObject({
        ok: false,
        code: 'VALIDATION',
        fieldErrors: { email: ['Enter a valid email address'] },
      })
    })

    it('resets the password with the emailed token and revokes sessions', async () => {
      const user = await createUser({ email: 'ada@example.com' })
      await signInAs(user)
      expect(await db.session.count({ where: { userId: user.id } })).toBeGreaterThan(0)
      await requestPasswordResetAction({ email: user.email })
      const token = tokenInPath(await lastMail('Reset your password'))

      expect(await resetPasswordAction({ token, password: 'brand-new-pass-1' })).toEqual({
        ok: true,
        data: null,
      })

      expect(await db.session.count({ where: { userId: user.id } })).toBe(0)
      cookieJar.clear()
      expect(await signInAction({ email: user.email, password: TEST_PASSWORD })).toMatchObject({
        ok: false,
        code: 'UNAUTHORIZED',
      })
      expect(await signInAction({ email: user.email, password: 'brand-new-pass-1' })).toEqual({
        ok: true,
        data: null,
      })
    })

    it('accepts a reset token only once', async () => {
      const user = await createUser({})
      await requestPasswordResetAction({ email: user.email })
      const token = tokenInPath(await lastMail('Reset your password'))
      await resetPasswordAction({ token, password: 'brand-new-pass-1' })
      expect(await resetPasswordAction({ token, password: 'another-pass-22' })).toEqual({
        ok: false,
        code: 'VALIDATION',
        message: 'This reset link is invalid or has expired. Request a new one.',
      })
    })

    it('rejects an unknown token and a short password', async () => {
      expect(
        await resetPasswordAction({ token: 'bogus', password: 'long-enough-1' }),
      ).toMatchObject({
        ok: false,
        code: 'VALIDATION',
        message: expect.stringContaining('invalid or has expired'),
      })
      const short = await resetPasswordAction({ token: 'bogus', password: 'short' })
      expect(!short.ok && short.fieldErrors?.password).toHaveLength(1)
    })

    it('rate limits reset requests per email in production only', async () => {
      const attempt = () => requestPasswordResetAction({ email: 'victim@example.com' })
      for (let n = 0; n < 5; n++) {
        expect(await attempt()).toMatchObject({ ok: true })
      }

      await resetRedis()
      vi.stubEnv('NODE_ENV', 'production')
      for (let n = 0; n < 3; n++) {
        expect(await attempt()).toMatchObject({ ok: true })
      }
      expect(await attempt()).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
    })

    it('resends the verification email to the signed-in user', async () => {
      const user = await createUser({ email: 'ada@example.com' })
      await signInAs(user)
      clearMail()
      expect(await resendVerificationAction()).toEqual({ ok: true, data: null })
      const mail = await lastMail('Verify your email')
      expect(mail.to).toBe('ada@example.com')
      expect(tokenOf(mail)).toEqual(expect.any(String))
    })

    it('requires a session to resend verification', async () => {
      expect(await resendVerificationAction()).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
      await flushMail()
      expect(sentMails()).toEqual([])
    })

    it('does not resend to an already verified user', async () => {
      const user = await createUser({})
      await db.user.update({ where: { id: user.id }, data: { emailVerified: true } })
      await signInAs(user)
      clearMail()
      expect(await resendVerificationAction()).toEqual({ ok: true, data: null })
      await flushMail()
      expect(sentMails()).toEqual([])
    })

    it('rate limits resending verification in production', async () => {
      const user = await createUser({})
      await signInAs(user)
      vi.stubEnv('NODE_ENV', 'production')
      for (let n = 0; n < 3; n++) {
        expect(await resendVerificationAction()).toEqual({ ok: true, data: null })
      }
      expect(await resendVerificationAction()).toEqual({
        ok: false,
        code: 'RATE_LIMITED',
        message: 'Too many attempts. Try again in a minute.',
      })
    })
  })
})

describe('account actions', () => {
  beforeEach(async () => {
    await resetDatabase()
    vi.mocked(refresh).mockClear()
    clearMail()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  afterAll(() => db.$disconnect())

  /** Signs in on one device after creating others, so `createUser` does not drop the cookie. */
  const signedInUser = async (overrides: Parameters<typeof createUser>[0] = {}) => {
    const user = await createUser(overrides)
    await db.session.deleteMany()
    await signInAs(user)
    return user
  }

  const addSession = async (userId: string) => {
    const id = randomUUID()
    return db.session.create({
      data: { id, token: `token-${id}`, userId, expiresAt: new Date(Date.now() + 3_600_000) },
    })
  }

  describe('changePasswordAction', () => {
    const input = { currentPassword: TEST_PASSWORD, newPassword: 'a-brand-new-one' }

    it('answers UNAUTHORIZED before looking at the input when signed out', async () => {
      expect(await changePasswordAction({ currentPassword: '', newPassword: '' })).toMatchObject({
        ok: false,
        code: 'UNAUTHORIZED',
      })
    })

    it('validates the new password', async () => {
      await signedInUser()
      const result = await changePasswordAction({ ...input, newPassword: 'short' })
      expect(result).toMatchObject({ ok: false, code: 'VALIDATION' })
      expect(!result.ok && result.fieldErrors?.newPassword).toHaveLength(1)
    })

    it('puts a wrong current password on its field and changes nothing', async () => {
      await signedInUser()
      expect(await changePasswordAction({ ...input, currentPassword: 'not-it-at-all' })).toEqual({
        ok: false,
        code: 'VALIDATION',
        message: 'Validation failed',
        fieldErrors: { currentPassword: ['Current password is incorrect'] },
      })
      expect(refresh).not.toHaveBeenCalled()
    })

    it('changes the password, keeps this session and signs the others out', async () => {
      const user = await signedInUser()
      const other = await addSession(user.id)
      expect(await changePasswordAction(input)).toEqual({ ok: true, data: null })
      expect(refresh).toHaveBeenCalledTimes(1)

      await expect(requireUser()).resolves.toMatchObject({ id: user.id })
      expect(await db.session.findUnique({ where: { id: other.id } })).toBeNull()

      cookieJar.clear()
      expect(await signInAction({ email: user.email, password: TEST_PASSWORD })).toMatchObject({
        ok: false,
      })
      expect(await signInAction({ email: user.email, password: input.newPassword })).toEqual({
        ok: true,
        data: null,
      })
    })

    it('rate limits per user in production', async () => {
      await signedInUser()
      vi.stubEnv('NODE_ENV', 'production')
      const wrong = { ...input, currentPassword: 'not-it-at-all' }
      for (let n = 0; n < 5; n++) {
        expect(await changePasswordAction(wrong)).toMatchObject({ code: 'VALIDATION' })
      }
      expect(await changePasswordAction(wrong)).toMatchObject({ code: 'RATE_LIMITED' })
    })
  })

  describe('changeEmailAction', () => {
    const emails = async () => {
      await flushMail()
      return sentMails()
    }

    it('answers UNAUTHORIZED before looking at the input when signed out', async () => {
      expect(await changeEmailAction({ newEmail: 'nope' })).toMatchObject({
        ok: false,
        code: 'UNAUTHORIZED',
      })
    })

    it('rejects a malformed address and the address the user already has', async () => {
      await signedInUser({ email: 'mine@example.com' })
      expect(await changeEmailAction({ newEmail: 'nope' })).toMatchObject({
        fieldErrors: { newEmail: ['Enter a valid email address'] },
      })
      expect(await changeEmailAction({ newEmail: 'Mine@Example.com' })).toMatchObject({
        ok: false,
        fieldErrors: { newEmail: ['That is already your email address'] },
      })
    })

    it('sends the confirmation to the current address of a verified user', async () => {
      const user = await createUser({ email: 'mine@example.com' })
      await db.user.update({ where: { id: user.id }, data: { emailVerified: true } })
      await signInAs(user)
      clearMail()

      expect(await changeEmailAction({ newEmail: 'Fresh@Example.com' })).toEqual({
        ok: true,
        data: null,
      })
      expect(refresh).toHaveBeenCalledTimes(1)
      const sent = await emails()
      expect(sent).toEqual([
        expect.objectContaining({ subject: 'Confirm your email change', to: 'mine@example.com' }),
      ])
      expect(sent[0].text).toContain('fresh@example.com')
      expect(tokenOf(sent[0])).toEqual(expect.any(String))
      expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
        email: 'mine@example.com',
      })
    })

    it('answers ok and sends nothing when the address is taken (no account enumeration)', async () => {
      await createUser({ email: 'taken@example.com' })
      const user = await createUser({ email: 'mine@example.com' })
      await db.user.update({ where: { id: user.id }, data: { emailVerified: true } })
      await signInAs(user)
      clearMail()

      expect(await changeEmailAction({ newEmail: 'taken@example.com' })).toEqual({
        ok: true,
        data: null,
      })
      expect(await emails()).toEqual([])
    })
  })

  describe('revoking sessions', () => {
    it('requires a session', async () => {
      expect(await revokeSessionAction('x')).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
      expect(await revokeOtherSessionsAction()).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
    })

    it('revokes one of the viewer’s sessions and refreshes', async () => {
      const user = await signedInUser()
      const other = await addSession(user.id)
      expect(await revokeSessionAction(other.id)).toEqual({ ok: true, data: null })
      expect(await db.session.findUnique({ where: { id: other.id } })).toBeNull()
      expect(refresh).toHaveBeenCalledTimes(1)
    })

    it('reports someone else’s session as not found and an invalid id as a validation failure', async () => {
      const stranger = await createUser({})
      await signedInUser()
      const theirs = await addSession(stranger.id)
      expect(await revokeSessionAction(theirs.id)).toMatchObject({ ok: false, code: 'NOT_FOUND' })
      expect(await revokeSessionAction('')).toMatchObject({ ok: false, code: 'VALIDATION' })
      expect(await db.session.findUnique({ where: { id: theirs.id } })).not.toBeNull()
    })

    it('signs every other session out and keeps this one', async () => {
      const user = await signedInUser()
      await addSession(user.id)
      await addSession(user.id)
      expect(await revokeOtherSessionsAction()).toEqual({ ok: true, data: null })
      expect(await db.session.count({ where: { userId: user.id } })).toBe(1)
      await expect(requireUser()).resolves.toMatchObject({ id: user.id })
    })
  })

  describe('deleteAccountAction', () => {
    it('answers UNAUTHORIZED before looking at the input when signed out', async () => {
      expect(await deleteAccountAction({ password: '' })).toMatchObject({
        ok: false,
        code: 'UNAUTHORIZED',
      })
    })

    it('requires the password', async () => {
      await signedInUser()
      expect(await deleteAccountAction({ password: '' })).toMatchObject({
        ok: false,
        fieldErrors: { password: ['Password is required'] },
      })
    })

    it('puts a wrong password on its field and keeps the account', async () => {
      const user = await signedInUser()
      expect(await deleteAccountAction({ password: 'not-the-password' })).toEqual({
        ok: false,
        code: 'VALIDATION',
        message: 'Validation failed',
        fieldErrors: { password: ['Password is incorrect'] },
      })
      expect(await db.user.count({ where: { id: user.id } })).toBe(1)
    })

    it('deletes the account with its posts and signs the browser out', async () => {
      const user = await signedInUser()
      await db.post.create({ data: { userId: user.id, title: 'T', body: 'B' } })
      expect(await deleteAccountAction({ password: TEST_PASSWORD })).toEqual({
        ok: true,
        data: null,
      })
      expect(await db.user.count()).toBe(0)
      expect(await db.post.count()).toBe(0)
      expect(refresh).toHaveBeenCalledTimes(1)
      await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError)
    })

    it('rate limits per user in production', async () => {
      await signedInUser()
      vi.stubEnv('NODE_ENV', 'production')
      for (let n = 0; n < 3; n++) {
        expect(await deleteAccountAction({ password: 'not-the-password' })).toMatchObject({
          code: 'VALIDATION',
        })
      }
      expect(await deleteAccountAction({ password: 'not-the-password' })).toMatchObject({
        code: 'RATE_LIMITED',
      })
    })
  })
})
