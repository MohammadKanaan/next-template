// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '@/lib/data/auth'
import { db } from '@/lib/data/db'
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/data/errors'
import { listPosts } from '@/lib/data/posts'
import {
  getCurrentUser,
  getViewer,
  isUsernameTaken,
  listUsers,
  setUserRole,
  updateProfile,
} from '@/lib/data/users'
import { enqueue } from '@/lib/server/queue'
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

describe('users DAL', () => {
  beforeEach(resetDatabase)
  afterAll(() => db.$disconnect())

  it('has no viewer when signed out', async () => {
    expect(await getViewer()).toBeNull()
    await expect(getCurrentUser()).rejects.toBeInstanceOf(UnauthorizedError)
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
    vi.mocked(enqueue).mockClear()
    const user = await createUser({})
    const [, payload] = vi.mocked(enqueue).mock.calls.at(-1)!
    const token =
      'template' in payload &&
      payload.template === 'verify-email' &&
      new URL(payload.props.url).searchParams.get('token')
    expect(token).toBeTruthy()

    await signInAs(user)
    expect((await getViewer())?.emailVerified).toBe(false)

    await auth.api.verifyEmail({ query: { token: String(token) }, headers: requestHeaders() })

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
      await db.post.create({
        data: { userId: user.id, title: 'T', body: 'B', status: 'published' },
      })
      await signInAs(user)
      expect((await getViewer())?.name).toBe('Before')
      expect((await listPosts({ page: 1, perPage: 10 })).items[0].author.name).toBe('Before')

      await updateProfile({ name: 'After', username: 'after_name' })

      expect((await getViewer())?.name).toBe('After')
      const author = (await listPosts({ page: 1, perPage: 10 })).items[0].author
      expect(author).toMatchObject({ name: 'After', username: 'after_name' })
    })
  })

  describe('listUsers', () => {
    const all = { page: 1, perPage: 10 }

    it('requires an admin: 401 signed out, 403 for a regular user', async () => {
      await expect(listUsers(all)).rejects.toBeInstanceOf(UnauthorizedError)
      const member = await createUser({})
      await signInAs(member)
      await expect(listUsers(all)).rejects.toBeInstanceOf(ForbiddenError)
    })

    it('lists every user with their post count, newest first', async () => {
      const first = await createUser({ name: 'First', username: 'first_u' })
      const second = await createUser({ name: 'Second', username: 'second_u' })
      const admin = await createUser({ name: 'Admin', username: 'admin_u', role: 'admin' })
      await db.post.createMany({
        data: [
          { userId: first.id, title: 'A', body: 'b' },
          { userId: first.id, title: 'B', body: 'b' },
        ],
      })
      await signInAs(admin)

      const page = await listUsers(all)
      expect(page).toMatchObject({ page: 1, perPage: 10, totalItems: 3, totalPages: 1 })
      expect(page.items.map((user) => user.username)).toEqual(['admin_u', 'second_u', 'first_u'])
      expect(page.items.find((user) => user.id === first.id)).toEqual({
        id: first.id,
        name: 'First',
        username: 'first_u',
        email: first.email,
        emailVerified: false,
        role: 'user',
        createdAt: expect.any(Date),
        postCount: 2,
      })
      expect(page.items.find((user) => user.id === second.id)?.postCount).toBe(0)
      expect(page.items[0]).not.toHaveProperty('_count')
    })

    it('paginates', async () => {
      for (const n of [1, 2, 3, 4, 5]) {
        await createUser({ username: `user_${n}` })
      }
      const admin = await createUser({ username: 'the_admin', role: 'admin' })
      await signInAs(admin)
      const first = await listUsers({ page: 1, perPage: 4 })
      const second = await listUsers({ page: 2, perPage: 4 })
      expect(first).toMatchObject({ totalItems: 6, totalPages: 2 })
      expect(first.items).toHaveLength(4)
      expect(second.items).toHaveLength(2)
      expect(new Set([...first.items, ...second.items].map((user) => user.id)).size).toBe(6)
    })

    it('searches name, username and email case-insensitively, and treats wildcards literally', async () => {
      await createUser({ name: 'Ada Lovelace', username: 'countess', email: 'a1@example.com' })
      await createUser({ name: 'Grace', username: 'admiral_g', email: 'grace@navy.test' })
      await createUser({ name: 'Alan', username: 'alan_t', email: 'turing@example.com' })
      const admin = await createUser({ name: 'Root', username: 'root_u', role: 'admin' })
      await signInAs(admin)

      const names = async (q: string) =>
        (await listUsers({ ...all, q })).items.map((user) => user.name).sort()
      expect(await names('LOVELACE')).toEqual(['Ada Lovelace'])
      expect(await names('ADMIRAL')).toEqual(['Grace'])
      expect(await names('turing@')).toEqual(['Alan'])
      expect(await names('nobody')).toEqual([])
      expect(await names('%')).toEqual([])
      // Ada, Alan and the admin (the generated address ends in example.com too), not Grace.
      expect((await listUsers({ ...all, q: 'example.com' })).totalItems).toBe(3)
    })

    it('is never served from a cache: a role change shows at once', async () => {
      const member = await createUser({ username: 'member_u' })
      const admin = await createUser({ username: 'boss_u', role: 'admin' })
      await signInAs(admin)
      const roleOf = async () =>
        (await listUsers(all)).items.find((user) => user.id === member.id)?.role
      expect(await roleOf()).toBe('user')
      await db.user.update({ where: { id: member.id }, data: { role: 'admin' } })
      expect(await roleOf()).toBe('admin')
    })
  })

  describe('setUserRole', () => {
    it('requires an admin: 401 signed out, 403 for a regular user, role unchanged', async () => {
      const target = await createUser({})
      await expect(setUserRole({ id: target.id, role: 'admin' })).rejects.toBeInstanceOf(
        UnauthorizedError,
      )
      const member = await createUser({})
      await signInAs(member)
      await expect(setUserRole({ id: target.id, role: 'admin' })).rejects.toBeInstanceOf(
        ForbiddenError,
      )
      await expect(setUserRole({ id: member.id, role: 'admin' })).rejects.toBeInstanceOf(
        ForbiddenError,
      )
      expect(await db.user.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({
        role: 'user',
      })
      expect(await db.user.findUniqueOrThrow({ where: { id: member.id } })).toMatchObject({
        role: 'user',
      })
    })

    it('reports a missing user as not found', async () => {
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await expect(setUserRole({ id: 'missing-id', role: 'admin' })).rejects.toBeInstanceOf(
        NotFoundError,
      )
    })

    it('refuses to change the admin’s own role', async () => {
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await expect(setUserRole({ id: admin.id, role: 'user' })).rejects.toBeInstanceOf(
        ForbiddenError,
      )
      expect(await db.user.findUniqueOrThrow({ where: { id: admin.id } })).toMatchObject({
        role: 'admin',
      })
    })

    it('changes another user’s role and returns the updated row', async () => {
      const target = await createUser({ name: 'Target' })
      await db.post.create({ data: { userId: target.id, title: 'T', body: 'b' } })
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)

      const promoted = await setUserRole({ id: target.id, role: 'admin' })
      expect(promoted).toMatchObject({ id: target.id, name: 'Target', role: 'admin', postCount: 1 })
      expect(await db.user.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({
        role: 'admin',
      })

      expect((await setUserRole({ id: target.id, role: 'user' })).role).toBe('user')
    })

    it('applies on the target’s next request and refreshes their cached viewer', async () => {
      const target = await createUser({})
      const admin = await createUser({ role: 'admin' })
      await signInAs(target)
      expect((await getViewer())?.role).toBe('user')
      await signInAs(admin)
      await setUserRole({ id: target.id, role: 'admin' })

      await signInAs(target)
      expect((await getViewer())?.role).toBe('admin')
      await expect(listUsers({ page: 1, perPage: 10 })).resolves.toBeDefined()
    })
  })
})
