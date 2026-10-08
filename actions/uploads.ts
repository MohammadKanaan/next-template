'use server'

import { refresh, revalidatePath } from 'next/cache'
import { ROUTE_POSTS } from '@/lib/constants-routes'
import { getSessionUser } from '@/lib/data/auth'
import { toActionFailure } from '@/lib/data/errors'
import { consumeRateLimit } from '@/lib/data/rateLimit'
import { attachAvatar, attachPostUpload, createUpload, detachPostUpload } from '@/lib/data/uploads'
import type { Attachment, CreateUploadInput, UploadTicket } from '@/lib/dto/uploads'
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

export const attachPostUploadAction = async (
  postId: number,
  uploadId: string,
): Promise<ActionResult<Attachment>> => {
  try {
    const attachment = await attachPostUpload(postId, uploadId)
    revalidatePath(ROUTE_POSTS, 'layout')
    return { ok: true, data: attachment }
  } catch (error) {
    return toActionFailure(error)
  }
}

export const detachPostUploadAction = async (
  postId: number,
  uploadId: string,
): Promise<ActionResult<null>> => {
  try {
    await detachPostUpload(postId, uploadId)
    revalidatePath(ROUTE_POSTS, 'layout')
    return { ok: true, data: null }
  } catch (error) {
    return toActionFailure(error)
  }
}
