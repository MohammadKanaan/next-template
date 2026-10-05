'use server'

import { refresh } from 'next/cache'
import { getSessionUser } from '@/lib/data/auth'
import { parseInput, toActionFailure } from '@/lib/data/errors'
import { consumeRateLimit, isRateLimitEnabled } from '@/lib/data/rateLimit'
import { attachAvatar, createAvatarUpload } from '@/lib/data/uploads'
import {
  createAvatarUploadInput,
  uploadIdSchema,
  type CreateAvatarUploadInput,
  type UploadTicket,
} from '@/lib/dto/uploads'
import type { CurrentUser } from '@/lib/dto/users'
import type { ActionResult } from '@/types/api'

export async function createAvatarUploadAction(
  input: CreateAvatarUploadInput,
): Promise<ActionResult<UploadTicket>> {
  try {
    const body = parseInput(createAvatarUploadInput, input)
    if (isRateLimitEnabled()) {
      // Signed-out callers are rejected by the DAL below; only a session has a user to count.
      const viewer = await getSessionUser()
      if (viewer) {
        await consumeRateLimit(`avatar-upload:user:${viewer.id}`, { max: 10, windowMs: 60_000 })
      }
    }
    const ticket = await createAvatarUpload(body)
    return { ok: true, data: ticket }
  } catch (error) {
    return toActionFailure(error)
  }
}

export async function attachAvatarAction(uploadId: string): Promise<ActionResult<CurrentUser>> {
  try {
    const user = await attachAvatar(parseInput(uploadIdSchema, uploadId))
    refresh()
    return { ok: true, data: user }
  } catch (error) {
    return toActionFailure(error)
  }
}
