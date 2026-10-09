// @vitest-environment node
import { refresh } from 'next/cache'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  banUserAction,
  impersonateUserAction,
  setUserRoleAction,
  stopImpersonatingAction,
  unbanUserAction,
} from '@/actions/admin'
import { getSessionUser } from '@/lib/data/auth'
import { db } from '@/lib/data/db'
import { createUser, resetDatabase, signInAs } from '../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(async () => import('../helpers/cookies'))
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

const userRow = (id: string) => db.user.findUniqueOrThrow({ where: { id } })

describe('admin actions', () => {
  beforeEach(async () => {
    await resetDatabase()
    vi.mocked(refresh).mockClear()
  })
  afterAll(() => db.$disconnect())

  describe('setUserRoleAction', () => {
    it('requires an admin and does not refresh', async () => {
      const target = await createUser({})
      expect(await setUserRoleAction({ id: target.id, role: 'admin' })).toEqual({
        ok: false,
        code: 'UNAUTHORIZED',
        message: 'Sign in to continue',
      })
      const member = await createUser({})
      await signInAs(member)
      expect(await setUserRoleAction({ id: target.id, role: 'admin' })).toMatchObject({
        ok: false,
        code: 'FORBIDDEN',
      })
      expect(refresh).not.toHaveBeenCalled()
      expect(await userRow(target.id)).toMatchObject({ role: 'user' })
    })

    it('validates the input', async () => {
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      expect(await setUserRoleAction({ id: 'a b', role: 'owner' as never })).toMatchObject({
        ok: false,
        code: 'VALIDATION',
        fieldErrors: { id: expect.any(Array), role: expect.any(Array) },
      })
      expect(refresh).not.toHaveBeenCalled()
    })

    it('changes the role, refreshes and returns the updated user', async () => {
      const target = await createUser({ name: 'Target' })
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      expect(await setUserRoleAction({ id: target.id, role: 'admin' })).toMatchObject({
        ok: true,
        data: { id: target.id, name: 'Target', role: 'admin', banned: false },
      })
      expect(refresh).toHaveBeenCalledTimes(1)
      expect(await userRow(target.id)).toMatchObject({ role: 'admin' })
    })

    it('refuses the admin’s own account and reports a missing user', async () => {
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      expect(await setUserRoleAction({ id: admin.id, role: 'user' })).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        message: 'You cannot change your own role',
      })
      expect(await setUserRoleAction({ id: 'missing-id', role: 'user' })).toEqual({
        ok: false,
        code: 'NOT_FOUND',
        message: 'User not found',
      })
      expect(refresh).not.toHaveBeenCalled()
    })
  })

  describe('banUserAction and unbanUserAction', () => {
    it('require an admin and do not refresh', async () => {
      const target = await createUser({})
      expect(await banUserAction({ id: target.id })).toMatchObject({
        ok: false,
        code: 'UNAUTHORIZED',
      })
      expect(await unbanUserAction(target.id)).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
      const member = await createUser({})
      await signInAs(member)
      expect(await banUserAction({ id: target.id })).toMatchObject({
        ok: false,
        code: 'FORBIDDEN',
      })
      expect(await unbanUserAction(target.id)).toMatchObject({ ok: false, code: 'FORBIDDEN' })
      expect(refresh).not.toHaveBeenCalled()
      expect(await userRow(target.id)).toMatchObject({ banned: false })
    })

    it('validate the input and put a long reason on its field', async () => {
      const target = await createUser({})
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      expect(await banUserAction({ id: 'a b' })).toMatchObject({
        ok: false,
        code: 'VALIDATION',
        fieldErrors: { id: ['Invalid user id'] },
      })
      expect(await banUserAction({ id: target.id, reason: 'x'.repeat(201) })).toMatchObject({
        ok: false,
        code: 'VALIDATION',
        fieldErrors: { reason: ['Reason must be 200 characters or fewer'] },
      })
      expect(await unbanUserAction('')).toMatchObject({ ok: false, code: 'VALIDATION' })
      expect(refresh).not.toHaveBeenCalled()
    })

    it('ban, then unban, each refreshing and returning the updated user', async () => {
      const target = await createUser({ name: 'Target' })
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)

      expect(await banUserAction({ id: target.id, reason: ' Spam ' })).toMatchObject({
        ok: true,
        data: { id: target.id, name: 'Target', banned: true, banReason: 'Spam' },
      })
      expect(refresh).toHaveBeenCalledTimes(1)
      expect(await db.session.count({ where: { userId: target.id } })).toBe(0)

      expect(await unbanUserAction(target.id)).toMatchObject({
        ok: true,
        data: { id: target.id, banned: false, banReason: null },
      })
      expect(refresh).toHaveBeenCalledTimes(2)
    })

    it('refuse to ban the admin’s own account and report a missing user', async () => {
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      expect(await banUserAction({ id: admin.id })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
      expect(await banUserAction({ id: 'missing-id' })).toEqual({
        ok: false,
        code: 'NOT_FOUND',
        message: 'User not found',
      })
      expect(await unbanUserAction('missing-id')).toMatchObject({ ok: false, code: 'NOT_FOUND' })
      expect(refresh).not.toHaveBeenCalled()
      expect(await userRow(admin.id)).toMatchObject({ banned: false })
    })
  })

  describe('impersonateUserAction and stopImpersonatingAction', () => {
    it('impersonation requires an admin and does not refresh', async () => {
      const target = await createUser({})
      expect(await impersonateUserAction(target.id)).toMatchObject({
        ok: false,
        code: 'UNAUTHORIZED',
      })
      const member = await createUser({})
      await signInAs(member)
      expect(await impersonateUserAction(target.id)).toMatchObject({
        ok: false,
        code: 'FORBIDDEN',
      })
      expect(refresh).not.toHaveBeenCalled()
      await expect(getSessionUser()).resolves.toMatchObject({ id: member.id })
    })

    it('validates the id and reports a missing user or another admin', async () => {
      const other = await createUser({ role: 'admin' })
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      expect(await impersonateUserAction('a b')).toMatchObject({ ok: false, code: 'VALIDATION' })
      expect(await impersonateUserAction('missing-id')).toMatchObject({
        ok: false,
        code: 'NOT_FOUND',
      })
      expect(await impersonateUserAction(other.id)).toMatchObject({ ok: false, code: 'FORBIDDEN' })
      expect(refresh).not.toHaveBeenCalled()
      await expect(getSessionUser()).resolves.toMatchObject({ id: admin.id })
    })

    it('impersonates, then stops and restores the admin, without a router refresh', async () => {
      const target = await createUser({})
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)

      expect(await impersonateUserAction(target.id)).toEqual({ ok: true, data: null })
      await expect(getSessionUser()).resolves.toMatchObject({
        id: target.id,
        impersonatedBy: admin.id,
      })

      expect(await stopImpersonatingAction()).toEqual({ ok: true, data: null })
      // The browser's cookie changed; a refresh would render with the old one, so the views do a
      // full navigation instead.
      expect(refresh).not.toHaveBeenCalled()
      await expect(getSessionUser()).resolves.toMatchObject({
        id: admin.id,
        impersonatedBy: null,
      })
    })

    it('stopping without impersonating is forbidden and does not refresh', async () => {
      const user = await createUser({})
      await signInAs(user)
      expect(await stopImpersonatingAction()).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        message: 'You are not impersonating anyone',
      })
      expect(refresh).not.toHaveBeenCalled()
    })
  })
})
