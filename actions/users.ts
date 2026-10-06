'use server'

import { refresh, revalidatePath } from 'next/cache'
import { ROUTE_POSTS } from '@/lib/constants-routes'
import { requireUser } from '@/lib/data/auth'
import { toActionFailure } from '@/lib/data/errors'
import { consumeRateLimit, isRateLimitEnabled } from '@/lib/data/rateLimit'
import { setUserRole, updateProfile } from '@/lib/data/users'
import type { AdminUser, CurrentUser, SetUserRoleInput, UpdateProfileInput } from '@/lib/dto/users'
import type { ActionResult } from '@/types/api'

export const updateProfileAction = async (
  input: UpdateProfileInput,
): Promise<ActionResult<CurrentUser>> => {
  try {
    const viewer = await requireUser()
    if (isRateLimitEnabled()) {
      await consumeRateLimit(`update-profile:user:${viewer.id}`, { max: 10, windowMs: 60_000 })
    }
    const user = await updateProfile(input)
    // The name and username also show on post cards and details.
    revalidatePath(ROUTE_POSTS, 'layout')
    refresh()
    return { ok: true, data: user }
  } catch (error) {
    return toActionFailure(error)
  }
}

/** Admin only (the DAL enforces it): makes a user an admin or a regular user again. */
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
