'use server'

import { refresh, revalidatePath } from 'next/cache'
import { ROUTE_POSTS } from '@/lib/constants-routes'
import { requireUser } from '@/lib/data/auth'
import { parseInput, toActionFailure } from '@/lib/data/errors'
import { consumeRateLimit, isRateLimitEnabled } from '@/lib/data/rateLimit'
import { updateProfile } from '@/lib/data/users'
import { updateProfileInput, type CurrentUser, type UpdateProfileInput } from '@/lib/dto/users'
import type { ActionResult } from '@/types/api'

export async function updateProfileAction(
  input: UpdateProfileInput,
): Promise<ActionResult<CurrentUser>> {
  try {
    const body = parseInput(updateProfileInput, input)
    const viewer = await requireUser()
    if (isRateLimitEnabled()) {
      await consumeRateLimit(`update-profile:user:${viewer.id}`, { max: 10, windowMs: 60_000 })
    }
    const user = await updateProfile(body)
    // The name and username also show on post cards and details.
    revalidatePath(ROUTE_POSTS, 'layout')
    refresh()
    return { ok: true, data: user }
  } catch (error) {
    return toActionFailure(error)
  }
}
