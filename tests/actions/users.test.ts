// @vitest-environment node
import { refresh, revalidatePath } from 'next/cache'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateProfileAction } from '@/actions/users'
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
