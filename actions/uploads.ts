'use server'

import { refresh } from 'next/cache'
import { getSessionUser } from '@/lib/data/auth'
import { toActionFailure } from '@/lib/data/errors'
import { consumeRateLimit } from '@/lib/data/rateLimit'
import { attachAvatar, createUpload } from '@/lib/data/uploads'
import type { CreateUploadInput, UploadTicket } from '@/lib/dto/uploads'
import type { CurrentUser } from '@/lib/dto/users'
import type { ActionResult } from '@/types/api'

export const createUploadAction = async (
  input: CreateUploadInput,
): Promise<ActionResult<UploadTicket>> => {
  try {
    // Signed-out callers are rejected by the DAL below; only a session has a user to count.
    const viewer = await getSessionUser()
    if (viewer) {
      await consumeRateLimit(`upload:user:${viewer.id}`, { max: 30, windowMs: 60_000 })
    }
    const ticket = await createUpload(input)
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
