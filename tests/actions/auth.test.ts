// @vitest-environment node
import { refresh } from 'next/cache'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { signInAction, signOutAction, signUpAction } from '@/actions/auth'
import { requireUser } from '@/lib/data/auth'
import { db } from '@/lib/data/db'
import { UnauthorizedError } from '@/lib/data/errors'
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
})
