// @vitest-environment node
import { APIError } from 'better-auth/api'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  banUser,
  getAdminOverview,
  getAdminUser,
  impersonateUser,
  listUsers,
  revokeUserSessions,
  setUserRole,
  stopImpersonating,
  unbanUser,
} from '@/lib/data/admin'
import { auth, getSessionUser, requireAdmin } from '@/lib/data/auth'
import { db } from '@/lib/data/db'
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/data/errors'
import { getViewer } from '@/lib/data/users'
import { ADMIN_OVERVIEW_RECENT, ADMIN_USER_POSTS } from '@/lib/dto/admin'
import { BAN_REASON_MAX_LENGTH, type ListUsersQuery } from '@/lib/dto/users'
import { getRedis } from '@/lib/server/redis'
import { cookieJar } from '../../helpers/cookies'
import {
  MISSING_ID,
  createUser,
  resetDatabase,
  signInAs,
  signOut,
  TEST_PASSWORD,
} from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

const all = { page: 1, perPage: 10 }

const userRow = (id: string) => db.user.findUniqueOrThrow({ where: { id } })

/** What Better Auth answers to a sign-in attempt, resolved so the test can inspect the error. */
const trySignIn = (email: string) =>
  auth.api
    .signInEmail({ body: { email, password: TEST_PASSWORD } })
    .then(() => null)
    .catch((error: unknown) => error)

describe('admin DAL', () => {
  beforeEach(resetDatabase)
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

  describe('listUsers', () => {
    it('requires an admin: 401 signed out, 403 for a regular user', async () => {
      await expect(listUsers(all)).rejects.toBeInstanceOf(UnauthorizedError)
      const member = await createUser({})
      await signInAs(member)
      await expect(listUsers(all)).rejects.toBeInstanceOf(ForbiddenError)
    })

    it('sorts the filtered users before pagination in either direction', async () => {
      const ada = await createUser({ name: 'Ada' })
      const zoe = await createUser({ name: 'Zoe' })
      const admin = await createUser({ name: 'Root', role: 'admin' })
      await signInAs(admin)
      const first = (direction: 'asc' | 'desc') =>
        listUsers({ page: 1, perPage: 1, role: 'user', sortBy: 'name', direction })
      expect((await first('asc')).items[0]?.id).toBe(ada.id)
      expect((await first('desc')).items[0]?.id).toBe(zoe.id)
    })

    it('filters by role and by status, together with the search', async () => {
      const bannedUser = await createUser({ name: 'Ben', username: 'ben_v' })
      await createUser({ name: 'Vera', username: 'vera_v' })
      const admin = await createUser({ name: 'Root', username: 'root_u', role: 'admin' })
      await signInAs(admin)
      await banUser({ id: bannedUser.id })

      const names = async (query: Partial<ListUsersQuery>) =>
        (await listUsers({ ...all, ...query })).items.map((user) => user.name).sort()
      expect(await names({ role: 'user' })).toEqual(['Ben', 'Vera'])
      expect(await names({ role: 'admin' })).toEqual(['Root'])
      expect(await names({ status: 'banned' })).toEqual(['Ben'])
      expect(await names({ status: 'active' })).toEqual(['Root', 'Vera'])
      expect(await names({ role: 'user', status: 'active' })).toEqual(['Vera'])
      expect(await names({ role: 'user', status: 'active', q: 'ben' })).toEqual([])
      await expect(listUsers({ ...all, role: 'owner' as never })).rejects.toBeInstanceOf(
        ValidationError,
      )
    })

    it('validates the query', async () => {
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await expect(listUsers({ page: 0, perPage: 10 })).rejects.toBeInstanceOf(ValidationError)
      await expect(listUsers({ ...all, q: 'a'.repeat(101) })).rejects.toBeInstanceOf(
        ValidationError,
      )
    })

    it('lists every user as the admin DTO, newest first', async () => {
      const first = await createUser({ name: 'First', username: 'first_u' })
      const second = await createUser({ name: 'Second', username: 'second_u' })
      const admin = await createUser({ name: 'Admin', username: 'admin_u', role: 'admin' })
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
        banned: false,
        banReason: null,
        createdAt: expect.any(Date),
      })
      expect(page.items.find((user) => user.id === second.id)).not.toHaveProperty('postCount')
    })

    it('carries the ban and its reason', async () => {
      const banned = await createUser({ username: 'banned_u' })
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await banUser({ id: banned.id, reason: 'Spam' })

      const { items } = await listUsers(all)
      expect(items.find((user) => user.id === banned.id)).toMatchObject({
        banned: true,
        banReason: 'Spam',
      })
      expect(items.find((user) => user.id === admin.id)).toMatchObject({
        banned: false,
        banReason: null,
      })
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
      await createUser({ name: '100% Sure', username: 'percent_u', email: 'p@percent.test' })
      const admin = await createUser({ name: 'Root', username: 'root_u', role: 'admin' })
      await signInAs(admin)

      const names = async (q: string) =>
        (await listUsers({ ...all, q })).items.map((user) => user.name).sort()
      expect(await names('LOVELACE')).toEqual(['Ada Lovelace'])
      expect(await names('ADMIRAL')).toEqual(['Grace'])
      expect(await names('turing@')).toEqual(['Alan'])
      expect(await names('nobody')).toEqual([])
      expect(await names('%')).toEqual(['100% Sure'])
      expect(await names('100%')).toEqual(['100% Sure'])
      // `_` would match any character; literally it only matches the usernames that carry one.
      expect(await names('_g')).toEqual(['Grace'])
      // Ada, Alan and the admin (the generated address ends in example.com too), not Grace.
      expect((await listUsers({ ...all, q: 'example.com' })).totalItems).toBe(3)
      // A blank search is no search.
      expect((await listUsers({ ...all, q: '   ' })).totalItems).toBe(5)
    })

    it('is never served from a cache: a role change or a ban shows at once', async () => {
      const member = await createUser({ username: 'member_u' })
      const admin = await createUser({ username: 'boss_u', role: 'admin' })
      await signInAs(admin)
      const rowOf = async () => (await listUsers(all)).items.find((user) => user.id === member.id)
      expect(await rowOf()).toMatchObject({ role: 'user', banned: false })
      await db.user.update({ where: { id: member.id }, data: { role: 'admin', banned: true } })
      expect(await rowOf()).toMatchObject({ role: 'admin', banned: true })
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
      expect(await userRow(target.id)).toMatchObject({ role: 'user' })
      expect(await userRow(member.id)).toMatchObject({ role: 'user' })
    })

    it('validates the id and the role', async () => {
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      const error = await setUserRole({ id: 'a b', role: 'owner' as never }).catch(
        (caught: unknown) => caught,
      )
      expect(error).toBeInstanceOf(ValidationError)
      expect(error).toMatchObject({
        fieldErrors: { id: ['Invalid user id'], role: [expect.any(String)] },
      })
    })

    it('reports a missing user as not found', async () => {
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await expect(setUserRole({ id: MISSING_ID, role: 'admin' })).rejects.toBeInstanceOf(
        NotFoundError,
      )
    })

    it('refuses to change the admin’s own role', async () => {
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await expect(setUserRole({ id: admin.id, role: 'user' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'You cannot change your own role',
      })
      expect(await userRow(admin.id)).toMatchObject({ role: 'admin' })
    })

    it('changes another user’s role and returns the updated row', async () => {
      const target = await createUser({ name: 'Target' })
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)

      const promoted = await setUserRole({ id: target.id, role: 'admin' })
      expect(promoted).toMatchObject({ id: target.id, name: 'Target', role: 'admin' })
      expect(await userRow(target.id)).toMatchObject({ role: 'admin' })
    })

    it('refuses to change another admin’s role: admins are peers', async () => {
      const peer = await createUser({ role: 'admin' })
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await expect(setUserRole({ id: peer.id, role: 'user' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Another admin’s role cannot be changed',
      })
      expect(await userRow(peer.id)).toMatchObject({ role: 'admin' })
    })

    it('applies on the target’s next request and refreshes their cached viewer', async () => {
      const target = await createUser({})
      const admin = await createUser({ role: 'admin' })
      await signInAs(target)
      expect((await getViewer())?.role).toBe('user')
      await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError)
      await signInAs(admin)
      await setUserRole({ id: target.id, role: 'admin' })

      await signInAs(target)
      expect((await getViewer())?.role).toBe('admin')
      await expect(requireAdmin()).resolves.toMatchObject({ id: target.id, role: 'admin' })
      await expect(listUsers(all)).resolves.toBeDefined()
    })
  })

  describe('banUser and unbanUser', () => {
    it('require an admin: 401 signed out, 403 for a regular user', async () => {
      const target = await createUser({})
      await expect(banUser({ id: target.id })).rejects.toBeInstanceOf(UnauthorizedError)
      await expect(unbanUser(target.id)).rejects.toBeInstanceOf(UnauthorizedError)
      const member = await createUser({})
      await signInAs(member)
      await expect(banUser({ id: target.id })).rejects.toBeInstanceOf(ForbiddenError)
      await expect(unbanUser(target.id)).rejects.toBeInstanceOf(ForbiddenError)
      expect(await userRow(target.id)).toMatchObject({ banned: false })
    })

    it('validate the id and bound the reason', async () => {
      const target = await createUser({})
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await expect(banUser({ id: 'a b' })).rejects.toBeInstanceOf(ValidationError)
      await expect(unbanUser('a b')).rejects.toBeInstanceOf(ValidationError)
      await expect(
        banUser({ id: target.id, reason: 'x'.repeat(BAN_REASON_MAX_LENGTH + 1) }),
      ).rejects.toMatchObject({
        code: 'VALIDATION',
        fieldErrors: { reason: [`Reason must be ${BAN_REASON_MAX_LENGTH} characters or fewer`] },
      })
      expect(await userRow(target.id)).toMatchObject({ banned: false })
    })

    it('report a missing user as not found', async () => {
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await expect(banUser({ id: MISSING_ID })).rejects.toBeInstanceOf(NotFoundError)
      await expect(unbanUser(MISSING_ID)).rejects.toBeInstanceOf(NotFoundError)
    })

    it('refuse to ban the admin’s own account', async () => {
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await expect(banUser({ id: admin.id, reason: 'oops' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'You cannot ban your own account',
      })
      expect(await userRow(admin.id)).toMatchObject({ banned: false })
      await expect(requireAdmin()).resolves.toMatchObject({ id: admin.id })
    })

    it('refuse to ban another admin, who keeps their sessions', async () => {
      const peer = await createUser({ role: 'admin' })
      await signInAs(peer)
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await expect(banUser({ id: peer.id, reason: 'rivalry' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Another admin cannot be banned',
      })
      expect(await userRow(peer.id)).toMatchObject({ banned: false, banReason: null })
      expect(await db.session.count({ where: { userId: peer.id } })).toBeGreaterThan(0)
      // Lifting a ban is not managing a peer: it only ever restores access.
      await expect(unbanUser(peer.id)).resolves.toMatchObject({ id: peer.id, banned: false })
    })

    it('ban: signs the user out everywhere and refuses their sign-in with the reason', async () => {
      const target = await createUser({ name: 'Target' })
      const bystander = await createUser({})
      await signInAs(target)
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)

      const banned = await banUser({ id: target.id, reason: '  Spamming the forum  ' })
      expect(banned).toMatchObject({
        id: target.id,
        name: 'Target',
        banned: true,
        banReason: 'Spamming the forum',
      })
      expect(await db.session.count({ where: { userId: target.id } })).toBe(0)
      expect(await db.session.count({ where: { userId: bystander.id } })).toBeGreaterThan(0)
      // The admin's own session is untouched.
      await expect(requireAdmin()).resolves.toMatchObject({ id: admin.id })

      signOut()
      const refused = await trySignIn(target.email)
      expect(refused).toBeInstanceOf(APIError)
      expect(refused).toMatchObject({
        status: 'FORBIDDEN',
        body: { code: 'BANNED_USER', message: 'Your account is banned: Spamming the forum' },
      })
      expect(cookieJar.size).toBe(0)
      expect(await getSessionUser()).toBeNull()
    })

    it('ban: the reason is optional, and the configured default stands in', async () => {
      const target = await createUser({})
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      const banned = await banUser({ id: target.id })
      expect(banned).toMatchObject({ banned: true, banReason: 'no reason given' })
      // A blank reason is the same as none.
      await unbanUser(target.id)
      expect((await banUser({ id: target.id, reason: '   ' })).banReason).toBe('no reason given')
      signOut()
      const refused = await trySignIn(target.email)
      expect((refused as APIError).body?.message).toBe('Your account is banned: no reason given')
    })

    it('ban: a ban made while the target is signed in ends their session at once', async () => {
      const target = await createUser({})
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      const adminCookies = new Map(cookieJar)

      await signInAs(target)
      expect(await getSessionUser()).toMatchObject({ id: target.id })
      const targetCookies = new Map(cookieJar)

      cookieJar.clear()
      for (const [name, value] of adminCookies) {
        cookieJar.set(name, value)
      }
      await banUser({ id: target.id })

      cookieJar.clear()
      for (const [name, value] of targetCookies) {
        cookieJar.set(name, value)
      }
      expect(await getSessionUser()).toBeNull()
    })

    it('unban: lets the user sign in again and clears the reason', async () => {
      const target = await createUser({})
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await banUser({ id: target.id, reason: 'Spam' })

      const unbanned = await unbanUser(target.id)
      expect(unbanned).toMatchObject({ id: target.id, banned: false, banReason: null })
      expect(await userRow(target.id)).toMatchObject({ banned: false, banReason: null })

      expect(await trySignIn(target.email)).toBeNull()
      expect(await getSessionUser()).toMatchObject({ id: target.id })
    })

    it('unban: a user who was never banned stays as they are', async () => {
      const target = await createUser({})
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      expect(await unbanUser(target.id)).toMatchObject({ banned: false, banReason: null })
    })

    it('refresh the target’s cached viewer so a lifted ban is seen at once', async () => {
      const target = await createUser({ name: 'Target' })
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await banUser({ id: target.id })
      await unbanUser(target.id)
      // The hook on Better Auth's user updates dropped the cached viewer, so a direct rename made
      // in between is what the next read sees.
      await db.user.update({ where: { id: target.id }, data: { name: 'Renamed' } })
      await signInAs(target)
      expect((await getViewer())?.name).toBe('Renamed')
    })
  })

  describe('revokeUserSessions', () => {
    it('requires an admin: 401 signed out, 403 for a regular user', async () => {
      const target = await createUser({})
      await expect(revokeUserSessions(target.id)).rejects.toBeInstanceOf(UnauthorizedError)
      await signInAs(await createUser({}))
      await expect(revokeUserSessions(target.id)).rejects.toBeInstanceOf(ForbiddenError)
    })

    it('validates the id and reports a missing user as not found', async () => {
      await signInAs(await createUser({ role: 'admin' }))
      await expect(revokeUserSessions('a b')).rejects.toBeInstanceOf(ValidationError)
      await expect(revokeUserSessions(MISSING_ID)).rejects.toBeInstanceOf(NotFoundError)
    })

    it('signs the user out everywhere and leaves the admin signed in', async () => {
      const target = await createUser({})
      await signInAs(target)
      await signInAs(target)
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      expect(await db.session.count({ where: { userId: target.id } })).toBeGreaterThan(0)

      await revokeUserSessions(target.id)

      expect(await db.session.count({ where: { userId: target.id } })).toBe(0)
      await expect(getSessionUser()).resolves.toMatchObject({ id: admin.id })
    })

    it("refuses the admin's own account and another admin, sessions kept", async () => {
      const other = await createUser({ role: 'admin' })
      await signInAs(other)
      const sessions = await db.session.count({ where: { userId: other.id } })
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)

      await expect(revokeUserSessions(admin.id)).rejects.toBeInstanceOf(ForbiddenError)
      await expect(revokeUserSessions(other.id)).rejects.toBeInstanceOf(ForbiddenError)

      expect(await db.session.count({ where: { userId: other.id } })).toBe(sessions)
      await expect(getSessionUser()).resolves.toMatchObject({ id: admin.id })
    })
  })

  describe('impersonateUser and stopImpersonating', () => {
    it('require an admin: 401 signed out, 403 for a regular user', async () => {
      const target = await createUser({})
      await expect(impersonateUser(target.id)).rejects.toBeInstanceOf(UnauthorizedError)
      const member = await createUser({})
      await signInAs(member)
      await expect(impersonateUser(target.id)).rejects.toBeInstanceOf(ForbiddenError)
      await expect(getSessionUser()).resolves.toMatchObject({ id: member.id })
    })

    it('validates the id and reports a missing user as not found', async () => {
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await expect(impersonateUser('a b')).rejects.toBeInstanceOf(ValidationError)
      await expect(impersonateUser(MISSING_ID)).rejects.toBeInstanceOf(NotFoundError)
      await expect(getSessionUser()).resolves.toMatchObject({
        id: admin.id,
        impersonatedBy: null,
      })
    })

    it('refuses to impersonate another admin', async () => {
      const other = await createUser({ role: 'admin' })
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await expect(impersonateUser(other.id)).rejects.toBeInstanceOf(ForbiddenError)
      await expect(getSessionUser()).resolves.toMatchObject({ id: admin.id })
      expect(
        await db.session.count({ where: { userId: other.id, impersonatedBy: admin.id } }),
      ).toBe(0)
    })

    it('signs this browser in as the user for an hour, remembering the admin', async () => {
      const target = await createUser({})
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      const adminSession = await getSessionUser()

      await impersonateUser(target.id)

      const session = await getSessionUser()
      expect(session).toMatchObject({ id: target.id, role: 'user', impersonatedBy: admin.id })
      expect((await getViewer())?.id).toBe(target.id)
      const row = await db.session.findUniqueOrThrow({ where: { id: session!.sessionId } })
      expect(row.impersonatedBy).toBe(admin.id)
      const hour = 60 * 60 * 1000
      expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(hour)
      expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(hour - 60_000)
      // The admin's own session is kept for the way back.
      expect(await db.session.count({ where: { id: adminSession!.sessionId } })).toBe(1)
      // An impersonated session has no admin powers.
      await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError)
      await expect(listUsers(all)).rejects.toBeInstanceOf(ForbiddenError)
    })

    it('stopImpersonating restores the admin and ends the impersonated session', async () => {
      const target = await createUser({})
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await impersonateUser(target.id)
      const impersonated = await getSessionUser()

      await stopImpersonating()

      expect(await getSessionUser()).toMatchObject({
        id: admin.id,
        role: 'admin',
        impersonatedBy: null,
      })
      await expect(requireAdmin()).resolves.toMatchObject({ id: admin.id })
      expect(await db.session.count({ where: { id: impersonated!.sessionId } })).toBe(0)
    })

    it('stopImpersonating answers 403 for a plain session', async () => {
      const user = await createUser({})
      await signInAs(user)
      await expect(stopImpersonating()).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'You are not impersonating anyone',
      })
      await expect(getSessionUser()).resolves.toMatchObject({ id: user.id })
    })
  })

  describe('getAdminUser', () => {
    it('requires an admin: 401 signed out, 403 for a regular user', async () => {
      const target = await createUser({})
      await expect(getAdminUser(target.id)).rejects.toBeInstanceOf(UnauthorizedError)
      await signInAs(await createUser({}))
      await expect(getAdminUser(target.id)).rejects.toBeInstanceOf(ForbiddenError)
    })

    it('treats a malformed or unknown id as not found', async () => {
      await signInAs(await createUser({ role: 'admin' }))
      await expect(getAdminUser('a b')).rejects.toBeInstanceOf(NotFoundError)
      await expect(getAdminUser(MISSING_ID)).rejects.toBeInstanceOf(NotFoundError)
    })

    it('returns the row with its image, its unexpired sessions (no token) and its newest posts, drafts included', async () => {
      const target = await createUser({ name: 'Target', username: 'target_u' })
      await db.user.update({
        where: { id: target.id },
        data: { image: 'https://pub.example/avatar.png' },
      })
      // Three live sessions (sign-up opened one, plus two sign-ins) and one expired.
      await signInAs(target)
      await signInAs(target)
      await db.session.create({
        data: {
          userId: target.id,
          token: 'expired-token',
          expiresAt: new Date(Date.now() - 1000),
          userAgent: 'Old',
        },
      })
      for (let n = 0; n <= ADMIN_USER_POSTS; n += 1) {
        await db.post.create({
          data: { userId: target.id, title: `Post ${n}`, body: 'B', published: n % 2 === 0 },
        })
      }
      const other = await createUser({})
      await db.post.create({ data: { userId: other.id, title: 'Someone else’s', body: 'B' } })
      await signInAs(await createUser({ role: 'admin' }))

      const detail = await getAdminUser(target.id)
      expect(detail).toMatchObject({
        id: target.id,
        name: 'Target',
        username: 'target_u',
        email: target.email,
        role: 'user',
        banned: false,
        image: 'https://pub.example/avatar.png',
        postCount: ADMIN_USER_POSTS + 1,
      })
      expect(detail.updatedAt).toBeInstanceOf(Date)
      expect(detail.sessions).toHaveLength(3)
      expect(detail.sessions[0]).not.toHaveProperty('token')
      // Newest first, capped, and the drafts are there.
      expect(detail.posts).toHaveLength(ADMIN_USER_POSTS)
      expect(detail.posts[0]?.title).toBe(`Post ${ADMIN_USER_POSTS}`)
      expect(detail.posts.some((post) => !post.published)).toBe(true)
      expect(detail.posts.map((post) => post.title)).not.toContain('Someone else’s')
    })
  })

  describe('getAdminOverview', () => {
    it('requires an admin: 401 signed out, 403 for a regular user', async () => {
      await expect(getAdminOverview()).rejects.toBeInstanceOf(UnauthorizedError)
      await signInAs(await createUser({}))
      await expect(getAdminOverview()).rejects.toBeInstanceOf(ForbiddenError)
    })

    it('counts the users and the posts, and lists what was added last', async () => {
      const banned = await createUser({ username: 'banned_u' })
      const author = await createUser({ username: 'author_u' })
      const admin = await createUser({ username: 'root_u', role: 'admin' })
      for (const n of [1, 2, 3, 4, 5, 6]) {
        await db.post.create({
          data: { userId: author.id, title: `Post ${n}`, body: 'B', published: n % 2 === 0 },
        })
      }
      await signInAs(admin)
      await banUser({ id: banned.id })

      const overview = await getAdminOverview()
      expect(overview.counts).toEqual({ users: 3, admins: 1, banned: 1, posts: 6, drafts: 3 })
      expect(overview.recentPosts.map((post) => post.title)).toEqual(
        ['Post 6', 'Post 5', 'Post 4', 'Post 3', 'Post 2'].slice(0, ADMIN_OVERVIEW_RECENT),
      )
      expect(overview.recentUsers.map((user) => user.username)).toEqual([
        'root_u',
        'author_u',
        'banned_u',
      ])
      expect(overview.recentUsers[2]).toMatchObject({ banned: true })
    })

    it('is never served from a cache', async () => {
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      expect((await getAdminOverview()).counts.posts).toBe(0)
      await db.post.create({ data: { userId: admin.id, title: 'T', body: 'B' } })
      expect((await getAdminOverview()).counts.posts).toBe(1)
    })
  })
})
