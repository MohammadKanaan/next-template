// @vitest-environment node
import { refresh, revalidatePath } from 'next/cache'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setUserRoleAction, updateProfileAction } from '@/actions/users'
import { db } from '@/lib/data/db'
import { createUser, resetDatabase, signInAs } from '../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(async () => import('../helpers/cookies'))
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

const input = { name: 'Ada Lovelace', username: 'ada_l', website: 'example.com' }

describe('updateProfileAction', () => {
  beforeEach(async () => {
    await resetDatabase()
    vi.mocked(refresh).mockClear()
    vi.mocked(revalidatePath).mockClear()
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(() => db.$disconnect())

  it('requires a session', async () => {
    expect(await updateProfileAction(input)).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
  })

  it('validates the input like sign-up does', async () => {
    const user = await createUser({})
    await signInAs(user)
    const result = await updateProfileAction({
      name: '',
      username: 'A!',
      website: 'javascript:alert(1)',
    })
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(!result.ok && Object.keys(result.fieldErrors ?? {}).sort()).toEqual([
      'name',
      'username',
      'website',
    ])
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      name: user.name,
    })
  })

  it('saves the profile, refreshes the router and returns the updated user', async () => {
    const user = await createUser({})
    await signInAs(user)
    const result = await updateProfileAction(input)
    expect(result).toMatchObject({
      ok: true,
      data: { id: user.id, name: 'Ada Lovelace', username: 'ada_l', website: 'example.com' },
    })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledWith('/posts', 'layout')
  })

  it('reports a taken username on its field', async () => {
    await createUser({ username: 'ada_l' })
    const user = await createUser({})
    await signInAs(user)
    expect(await updateProfileAction(input)).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Validation failed',
      fieldErrors: { username: ['That username is taken'] },
    })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('rate limits per user in production', async () => {
    const user = await createUser({})
    await signInAs(user)
    vi.stubEnv('NODE_ENV', 'production')
    for (let n = 0; n < 10; n++) {
      expect(await updateProfileAction(input)).toMatchObject({ ok: true })
    }
    expect(await updateProfileAction(input)).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
  })
})

describe('setUserRoleAction', () => {
  beforeEach(async () => {
    await resetDatabase()
    vi.mocked(refresh).mockClear()
  })
  afterAll(() => db.$disconnect())

  it('requires an admin', async () => {
    const target = await createUser({})
    expect(await setUserRoleAction({ id: target.id, role: 'admin' })).toMatchObject({
      ok: false,
      code: 'UNAUTHORIZED',
    })
    const member = await createUser({})
    await signInAs(member)
    expect(await setUserRoleAction({ id: target.id, role: 'admin' })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('validates the input', async () => {
    const admin = await createUser({ role: 'admin' })
    await signInAs(admin)
    expect(await setUserRoleAction({ id: 'a b', role: 'owner' as never })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { id: expect.any(Array), role: expect.any(Array) },
    })
  })

  it('changes the role, refreshes and returns the updated user', async () => {
    const target = await createUser({ name: 'Target' })
    const admin = await createUser({ role: 'admin' })
    await signInAs(admin)
    expect(await setUserRoleAction({ id: target.id, role: 'admin' })).toMatchObject({
      ok: true,
      data: { id: target.id, role: 'admin' },
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('refuses the admin’s own account and reports a missing user', async () => {
    const admin = await createUser({ role: 'admin' })
    await signInAs(admin)
    expect(await setUserRoleAction({ id: admin.id, role: 'user' })).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      message: 'You cannot change your own role',
    })
    expect(await setUserRoleAction({ id: 'missing-id', role: 'user' })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
  })
})
