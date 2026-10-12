// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '@/lib/data/auth'
import { db } from '@/lib/data/db'
import { UnauthorizedError, ValidationError } from '@/lib/data/errors'
import { listPosts } from '@/lib/data/posts'
import {
  deleteAccount,
  getCurrentUser,
  getViewer,
  hasPassword,
  isUsernameTaken,
  updateProfile,
} from '@/lib/data/users'
import { getRedis } from '@/lib/server/redis'
import { cookieJar } from '../../helpers/cookies'
import { clearMail, flushMail, sentMailsWithSubject, tokenOf } from '../../helpers/mail'
import { createUser, resetDatabase, signInAs, TEST_PASSWORD } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

describe('users DAL', () => {
  beforeEach(async () => {
    await resetDatabase()
    clearMail()
  })
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

  it('has no viewer when signed out', async () => {
    expect(await getViewer()).toBeNull()
    await expect(getCurrentUser()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('reports whether the viewer has a password', async () => {
    await expect(hasPassword()).rejects.toBeInstanceOf(UnauthorizedError)

    const user = await createUser({})
    await signInAs(user)
    expect(await hasPassword()).toBe(true)

    // An account created through Google has no credential account.
    await db.account.deleteMany({ where: { userId: user.id, providerId: 'credential' } })
    await db.account.create({
      data: {
        accountId: 'google-sub',
        providerId: 'google',
        userId: user.id,
      },
    })
    expect(await hasPassword()).toBe(false)
  })

  it('treats a forged or stale session cookie as no viewer', async () => {
    cookieJar.set('better-auth.session_token', 'forged.value')
    expect(await getViewer()).toBeNull()
    await expect(getCurrentUser()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('returns exactly the current-user fields when signed in', async () => {
    const user = await createUser({ name: 'Ada', username: 'ada', email: 'ada@example.com' })
    await signInAs(user)
    const expected = {
      id: user.id,
      name: 'Ada',
      username: 'ada',
      email: 'ada@example.com',
      emailVerified: false,
      image: null,
      website: null,
      role: 'user',
    }
    expect(await getViewer()).toEqual(expected)
    expect(await getCurrentUser()).toEqual(expected)
  })

  it('serves the viewer from the cache, and a Better Auth user update refreshes it', async () => {
    const user = await createUser({ name: 'Ada' })
    await signInAs(user)
    expect((await getViewer())?.name).toBe('Ada')

    // Straight to the database: the cached viewer is served until its tag is invalidated.
    await db.user.update({ where: { id: user.id }, data: { name: 'Direct' } })
    expect((await getViewer())?.name).toBe('Ada')

    // A Better Auth-side update (what email verification does) fires the hook that invalidates it.
    await auth.api.updateUser({ body: { name: 'Via Better Auth' }, headers: requestHeaders() })
    expect((await getViewer())?.name).toBe('Via Better Auth')
  })

  it('flips the cached viewer to verified when the emailed link is opened', async () => {
    const user = await createUser({})
    await flushMail()
    const [mail] = sentMailsWithSubject('Verify your email')
    expect(mail.to).toBe(user.email)

    await signInAs(user)
    expect((await getViewer())?.emailVerified).toBe(false)

    await auth.api.verifyEmail({ query: { token: tokenOf(mail) }, headers: requestHeaders() })

    expect((await getViewer())?.emailVerified).toBe(true)
  })

  it('reports whether a username is taken', async () => {
    await createUser({ username: 'taken' })
    expect(await isUsernameTaken('taken')).toBe(true)
    expect(await isUsernameTaken('free')).toBe(false)
  })

  describe('updateProfile', () => {
    it('requires a session', async () => {
      await expect(
        updateProfile({ name: 'Ada', username: 'ada', website: null }),
      ).rejects.toBeInstanceOf(UnauthorizedError)
    })

    it('validates its input itself, whoever calls', async () => {
      const user = await createUser({ name: 'Kept' })
      await signInAs(user)
      const error = await updateProfile({
        name: '',
        username: 'A!',
        website: 'javascript:alert(1)',
      }).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(ValidationError)
      expect(Object.keys((error as ValidationError).fieldErrors ?? {}).sort()).toEqual([
        'name',
        'username',
        'website',
      ])
      expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
        name: 'Kept',
      })
    })

    it('updates name, username and website of the viewer only', async () => {
      const user = await createUser({ name: 'Old', username: 'old_name' })
      const other = await createUser({ name: 'Other', username: 'other_one' })
      await signInAs(user)

      const updated = await updateProfile({
        name: 'New Name',
        username: 'new_name',
        website: 'example.com',
      })

      expect(updated).toMatchObject({
        id: user.id,
        name: 'New Name',
        username: 'new_name',
        website: 'example.com',
      })
      expect(await db.user.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({
        name: 'Other',
        username: 'other_one',
        website: null,
      })
    })

    it('keeps the website when it is left out and clears it for an empty string or null', async () => {
      const user = await createUser({})
      await signInAs(user)
      await updateProfile({ name: 'A', username: 'a_user', website: 'example.com' })

      await updateProfile({ name: 'B', username: 'a_user' })
      expect((await getCurrentUser()).website).toBe('example.com')

      await updateProfile({ name: 'B', username: 'a_user', website: '' })
      expect((await getCurrentUser()).website).toBeNull()

      await updateProfile({ name: 'B', username: 'a_user', website: 'example.com' })
      await updateProfile({ name: 'B', username: 'a_user', website: null })
      expect((await getCurrentUser()).website).toBeNull()
    })

    it('reports a taken username as a field error and changes nothing', async () => {
      await createUser({ username: 'taken_name' })
      const user = await createUser({ name: 'Me', username: 'mine' })
      await signInAs(user)
      const error = await updateProfile({
        name: 'Changed',
        username: 'taken_name',
        website: null,
      }).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(ValidationError)
      expect(error).toMatchObject({ fieldErrors: { username: ['That username is taken'] } })
      expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
        name: 'Me',
        username: 'mine',
      })
    })

    it('lets the user keep their own username', async () => {
      const user = await createUser({ username: 'same_name' })
      await signInAs(user)
      await expect(
        updateProfile({ name: 'Renamed', username: 'same_name' }),
      ).resolves.toMatchObject({ name: 'Renamed', username: 'same_name' })
    })

    it('refreshes the cached viewer and the cached post lists that embed the author', async () => {
      const user = await createUser({ name: 'Before', username: 'before_name' })
      await db.post.create({ data: { userId: user.id, title: 'T', body: 'B', published: true } })
      await signInAs(user)
      expect((await getViewer())?.name).toBe('Before')
      expect((await listPosts({ page: 1, perPage: 10 })).items[0].author.name).toBe('Before')

      await updateProfile({ name: 'After', username: 'after_name' })

      expect((await getViewer())?.name).toBe('After')
      const author = (await listPosts({ page: 1, perPage: 10 })).items[0].author
      expect(author).toMatchObject({ name: 'After', username: 'after_name' })
    })
  })

  describe('deleteAccount', () => {
    it('requires a session before looking at the input', async () => {
      await expect(deleteAccount({ password: '' })).rejects.toBeInstanceOf(UnauthorizedError)
    })

    it('validates the password and puts a wrong one on its field, keeping the account', async () => {
      const user = await createUser({})
      await signInAs(user)
      await expect(deleteAccount({ password: '' })).rejects.toMatchObject({
        code: 'VALIDATION',
        fieldErrors: { password: ['Password is required'] },
      })
      await expect(deleteAccount({ password: 'not-the-password' })).rejects.toMatchObject({
        code: 'VALIDATION',
        fieldErrors: { password: ['Password is incorrect'] },
      })
      expect(await db.user.count({ where: { id: user.id } })).toBe(1)
    })

    it('deletes the account and drops every cache that embedded the user', async () => {
      const user = await createUser({ name: 'Gone' })
      await db.post.create({ data: { userId: user.id, title: 'T', body: 'B', published: true } })
      expect((await listPosts({ page: 1, perPage: 10 })).items).toHaveLength(1)
      await signInAs(user)
      expect(await getViewer()).toMatchObject({ name: 'Gone' })

      await deleteAccount({ password: TEST_PASSWORD })

      expect(await db.user.count({ where: { id: user.id } })).toBe(0)
      expect(await db.session.count({ where: { userId: user.id } })).toBe(0)
      expect((await listPosts({ page: 1, perPage: 10 })).items).toEqual([])
      expect(await getViewer()).toBeNull()
    })
  })
})
