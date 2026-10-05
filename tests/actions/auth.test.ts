// @vitest-environment node
import { APIError } from 'better-auth/api'
import { refresh } from 'next/cache'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signInAction, signOutAction, signUpAction } from '@/actions/auth'
import { auth, requireUser } from '@/lib/data/auth'
import { db } from '@/lib/data/db'
import { UnauthorizedError } from '@/lib/data/errors'
import { resetRateLimits } from '@/lib/data/rateLimit'
import { cookieJar } from '../helpers/cookies'
import { createUser, resetDatabase, signInAs, TEST_PASSWORD } from '../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(async () => import('../helpers/cookies'))
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

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
    resetRateLimits()
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
    expect(stored).toMatchObject({ email: 'new@example.com', role: 'user' })
  })

  it('rejects a taken username', async () => {
    await createUser({ username: 'taken' })
    expect(await signUpAction({ ...newUser, username: 'taken' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { username: ['That username is taken'] },
    })
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

    resetRateLimits()
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
})
