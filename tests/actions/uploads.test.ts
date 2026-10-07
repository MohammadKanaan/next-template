// @vitest-environment node
import { refresh } from 'next/cache'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachAvatarAction, createAvatarUploadAction } from '@/actions/uploads'
import { db } from '@/lib/data/db'
import { createUser, resetDatabase, resetRedis, signInAs, signOut } from '../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(async () => import('../helpers/cookies'))
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/server/storage', () => ({
  createUploadTicket: vi.fn(async () => ({
    url: 'http://storage.test/bucket',
    fields: { k: 'v' },
  })),
  headObject: vi.fn(async () => ({ size: 1024, contentType: 'image/png' })),
  deleteObject: vi.fn(async () => {}),
  publicUrl: (key: string) => `http://storage.test/bucket/${key}`,
}))

describe('upload actions', () => {
  beforeEach(async () => {
    await resetDatabase()
    vi.mocked(refresh).mockClear()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })
  afterAll(() => db.$disconnect())

  it('rejects a bad type or size with field errors, before touching the DAL', async () => {
    await signInAs(await createUser({}))
    const badType = await createAvatarUploadAction({ contentType: 'image/gif' as never, size: 10 })
    expect(badType).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(badType.ok === false && badType.fieldErrors?.contentType).toHaveLength(1)
    const tooBig = await createAvatarUploadAction({
      contentType: 'image/png',
      size: 2 * 1024 * 1024 + 1,
    })
    expect(tooBig).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(await db.upload.count()).toBe(0)
  })

  it('returns UNAUTHORIZED when signed out', async () => {
    signOut()
    expect(await createAvatarUploadAction({ contentType: 'image/png', size: 10 })).toMatchObject({
      ok: false,
      code: 'UNAUTHORIZED',
    })
    expect(await attachAvatarAction(crypto.randomUUID())).toMatchObject({
      ok: false,
      code: 'UNAUTHORIZED',
    })
  })

  it('creates a ticket, then attaches and refreshes the router', async () => {
    const user = await createUser({})
    await signInAs(user)
    const created = await createAvatarUploadAction({ contentType: 'image/png', size: 1024 })
    expect(created.ok && created.data).toMatchObject({ url: 'http://storage.test/bucket' })
    if (!created.ok) {
      throw new Error('expected a ticket')
    }

    const attached = await attachAvatarAction(created.data.uploadId)

    expect(attached).toMatchObject({ ok: true, data: { id: user.id } })
    expect(attached.ok && attached.data.image).toMatch(/^http:\/\/storage\.test\/bucket\/avatars\//)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('rejects a malformed upload id and maps 404 / 403', async () => {
    const owner = await createUser({})
    const other = await createUser({})
    await signInAs(owner)
    const created = await createAvatarUploadAction({ contentType: 'image/png', size: 1024 })
    if (!created.ok) {
      throw new Error('expected a ticket')
    }

    await signInAs(other)
    expect(await attachAvatarAction('not-a-uuid')).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(await attachAvatarAction(crypto.randomUUID())).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
    expect(await attachAvatarAction(created.data.uploadId)).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('rate limits ticket requests per user in production only', async () => {
    const [first, second] = [await createUser({}), await createUser({})]
    // The pending-upload cap would refuse a fourth live ticket, so clear the rows each time: this
    // test is about the action's per-minute limit, not that cap.
    const request = async () => {
      await db.upload.deleteMany()
      return createAvatarUploadAction({ contentType: 'image/png', size: 1024 })
    }
    await signInAs(first)
    for (let n = 0; n < 12; n++) {
      expect(await request()).toMatchObject({ ok: true })
    }

    await resetRedis()
    vi.stubEnv('NODE_ENV', 'production')
    for (let n = 0; n < 10; n++) {
      expect(await request()).toMatchObject({ ok: true })
    }
    expect(await request()).toMatchObject({ ok: false, code: 'RATE_LIMITED' })

    await signInAs(second)
    expect(await request()).toMatchObject({ ok: true })
  })
})
