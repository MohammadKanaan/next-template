// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSessionUser, requireAdmin, requireUser } from '@/lib/data/auth'
import { db } from '@/lib/data/db'
import { ForbiddenError, UnauthorizedError } from '@/lib/data/errors'
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
})
