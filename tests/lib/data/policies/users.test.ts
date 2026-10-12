// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/data/auth'
import { permissionsFor } from '@/lib/data/policy'
import { userPolicy, type UserRecord } from '@/lib/data/policies/users'

const as = (role: SessionUser['role'], id = 'u1'): SessionUser => ({
  id,
  role,
  sessionId: 's1',
  impersonatedBy: null,
})

const permissions = (viewer: SessionUser | null, record: UserRecord) =>
  permissionsFor(userPolicy, ['setRole', 'ban', 'revokeSessions'], viewer, record)

const NONE = { setRole: false, ban: false, revokeSessions: false }

describe('userPolicy', () => {
  it('gives nothing to a signed-out visitor or a regular user', () => {
    const target: UserRecord = { id: 'u2', role: 'user' }
    expect(permissions(null, target)).toEqual(NONE)
    expect(permissions(as('user'), target)).toEqual(NONE)
  })

  it('lets an admin manage a regular user', () => {
    expect(permissions(as('admin'), { id: 'u2', role: 'user' })).toEqual({
      setRole: true,
      ban: true,
      revokeSessions: true,
    })
  })

  it('never lets an admin act on their own account or on another admin', () => {
    expect(permissions(as('admin'), { id: 'u1', role: 'admin' })).toEqual(NONE)
    expect(permissions(as('admin'), { id: 'u2', role: 'admin' })).toEqual(NONE)
  })
})
