'use server'

import { refresh } from 'next/cache'
import { toActionFailure } from '@/lib/data/errors'
import { attachAvatar, createUpload } from '@/lib/data/uploads'
import type { CreateUploadInput, UploadTicket } from '@/lib/dto/uploads'
import type { CurrentUser } from '@/lib/dto/users'
import type { ActionResult } from '@/types/api'

export const createUploadAction = async (
  input: CreateUploadInput,
): Promise<ActionResult<UploadTicket>> => {
  try {
    const ticket = await createUpload(input)
    return { ok: true, data: ticket }
  } catch (error) {
    return toActionFailure(error)
  }
}

export const attachAvatarAction = async (key: string): Promise<ActionResult<CurrentUser>> => {
  try {
    const user = await attachAvatar(key)
    refresh()
    return { ok: true, data: user }
  } catch (error) {
    return toActionFailure(error)
  }
}
