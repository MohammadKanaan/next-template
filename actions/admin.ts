'use server'

import { refresh } from 'next/cache'
import {
  banUser,
  impersonateUser,
  revokeUserSessions,
  setUserRole,
  stopImpersonating,
  unbanUser,
} from '@/lib/data/admin'
import { toActionFailure } from '@/lib/data/errors'
import type { AdminUser, BanUserInput, SetUserRoleInput } from '@/lib/dto/users'
import type { ActionResult } from '@/types/api'

// Admin only, enforced by the DAL: each action hands its arguments over untouched.

export const setUserRoleAction = async (
  input: SetUserRoleInput,
): Promise<ActionResult<AdminUser>> => {
  try {
    const user = await setUserRole(input)
    refresh()
    return { ok: true, data: user }
  } catch (error) {
    return toActionFailure(error)
  }
}

export const banUserAction = async (input: BanUserInput): Promise<ActionResult<AdminUser>> => {
  try {
    const user = await banUser(input)
    refresh()
    return { ok: true, data: user }
  } catch (error) {
    return toActionFailure(error)
  }
}

export const unbanUserAction = async (id: string): Promise<ActionResult<AdminUser>> => {
  try {
    const user = await unbanUser(id)
    refresh()
    return { ok: true, data: user }
  } catch (error) {
    return toActionFailure(error)
  }
}

/** Signs the user out everywhere; they may sign in again. */
export const revokeUserSessionsAction = async (id: string): Promise<ActionResult<null>> => {
  try {
    await revokeUserSessions(id)
    refresh()
    return { ok: true, data: null }
  } catch (error) {
    return toActionFailure(error)
  }
}

/**
 * Signs this browser in as the user. No `refresh()`: it would render with the request's original
 * cookie header, still the admin's. The calling view does a full navigation instead.
 */
export const impersonateUserAction = async (id: string): Promise<ActionResult<null>> => {
  try {
    await impersonateUser(id)
    return { ok: true, data: null }
  } catch (error) {
    return toActionFailure(error)
  }
}

/** Restores the admin's session; the banner does a full navigation afterwards (see above). */
export const stopImpersonatingAction = async (): Promise<ActionResult<null>> => {
  try {
    await stopImpersonating()
    return { ok: true, data: null }
  } catch (error) {
    return toActionFailure(error)
  }
}
