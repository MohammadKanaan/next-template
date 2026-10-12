import 'server-only'
import type { Role } from '@/lib/dto/users'
import type { Policy, Rule } from '../policy'

/** What a user rule may look at: the target's id and role. */
export type UserRecord = { id: string; role: Role }

/**
 * Admins are peers: an admin manages regular users, never another admin and never their own
 * account. So nobody can ban, demote or sign out the admin who could undo it, and the last admin
 * cannot lock themselves out. An admin is promoted here and steps down only through the database.
 */
const managesUser: Rule<UserRecord> = (viewer, record) =>
  viewer !== null && viewer.role === 'admin' && viewer.id !== record.id && record.role !== 'admin'

export const userPolicy = {
  setRole: managesUser,
  ban: managesUser,
  revokeSessions: managesUser,
} satisfies Policy<UserRecord>
