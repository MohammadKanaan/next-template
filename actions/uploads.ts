'use server'

import { refresh } from 'next/cache'
import { getSessionUser } from '@/lib/data/auth'
import { toActionFailure } from '@/lib/data/errors'
import { consumeRateLimit, isRateLimitEnabled } from '@/lib/data/rateLimit'
import { attachAvatar, createAvatarUpload } from '@/lib/data/uploads'
import type { CreateAvatarUploadInput, UploadTicket } from '@/lib/dto/uploads'
import type { CurrentUser } from '@/lib/dto/users'
import type { ActionResult } from '@/types/api'

export const createAvatarUploadAction = async (
  input: CreateAvatarUploadInput,
): Promise<ActionResult<UploadTicket>> => {
  try {
    if (isRateLimitEnabled()) {
      // Signed-out callers are rejected by the DAL below; only a session has a user to count.
      const viewer = await getSessionUser()
      if (viewer) {
        await consumeRateLimit(`avatar-upload:user:${viewer.id}`, { max: 10, windowMs: 60_000 })
      }
    }
    const ticket = await createAvatarUpload(input)
    return { ok: true, data: ticket }
  } catch (error) {
    return toActionFailure(error)
  }
}

export const attachAvatarAction = async (uploadId: string): Promise<ActionResult<CurrentUser>> => {
  try {
    const user = await attachAvatar(uploadId)
    refresh()
    return { ok: true, data: user }
  } catch (error) {
    return toActionFailure(error)
  }
}
