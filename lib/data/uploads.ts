import 'server-only'
import { randomUUID } from 'node:crypto'
import {
  AVATAR_CONTENT_TYPES,
  AVATAR_MAX_SIZE,
  type CreateAvatarUploadInput,
  type UploadTicket,
} from '@/lib/dto/uploads'
import type { CurrentUser } from '@/lib/dto/users'
import { invalidateTags } from '@/lib/server/cache'
import { enqueue } from '@/lib/server/queue'
import { createUploadTicket, deleteObject, headObject, publicUrl } from '@/lib/server/storage'
import { requireUser } from './auth'
import { userTag } from './cacheTags'
import { db } from './db'
import { ForbiddenError, NotFoundError, ValidationError } from './errors'
import { currentUserSelect } from './users'

/** Signed in → returns a presigned POST for a new avatar object and the pending upload's id. */
export async function createAvatarUpload(input: CreateAvatarUploadInput): Promise<UploadTicket> {
  const viewer = await requireUser()
  const key = `avatars/${viewer.id}/${randomUUID()}`
  const upload = await db.upload.create({
    data: {
      key,
      userId: viewer.id,
      purpose: 'avatar',
      contentType: input.contentType,
      size: input.size,
    },
    select: { id: true },
  })
  const ticket = await createUploadTicket({
    key,
    contentType: input.contentType,
    maxSize: AVATAR_MAX_SIZE,
  })
  return { uploadId: upload.id, ...ticket }
}

function isAvatarContentType(value: string | null): boolean {
  return AVATAR_CONTENT_TYPES.some((type) => type === value)
}

/** Signed in, upload exists, and it is the viewer's own — in that order. */
async function requireOwnUpload(uploadId: string) {
  const viewer = await requireUser()
  const upload = await db.upload.findUnique({
    where: { id: uploadId },
    select: { id: true, key: true, userId: true, purpose: true, status: true },
  })
  if (!upload || upload.purpose !== 'avatar') {
    throw new NotFoundError('Upload not found')
  }
  if (upload.userId !== viewer.id) {
    throw new ForbiddenError('You cannot use this upload')
  }
  return { viewer, upload }
}

/**
 * Makes a finished upload the viewer's avatar. The stored object is checked against the limits
 * (the presigned policy should already have enforced them); the replaced avatar's object is
 * removed by a job, because the bucket call is slow and may fail independently.
 */
export async function attachAvatar(uploadId: string): Promise<CurrentUser> {
  const { viewer, upload } = await requireOwnUpload(uploadId)
  if (upload.status !== 'pending') {
    throw new ValidationError({ uploadId: ['This upload was already used'] })
  }

  const head = await headObject(upload.key)
  if (!head) {
    throw new ValidationError({ uploadId: ['The file was not uploaded'] })
  }
  if (head.size < 1 || head.size > AVATAR_MAX_SIZE || !isAvatarContentType(head.contentType)) {
    // Never keep an object that broke the rules.
    await deleteObject(upload.key)
    await db.upload.delete({ where: { id: upload.id } })
    throw new ValidationError({ uploadId: ['The image must be a PNG, JPEG, or WebP up to 2 MB'] })
  }

  const [replaced, user] = await db.$transaction(async (tx) => {
    const previous = await tx.upload.findMany({
      where: { userId: viewer.id, purpose: 'avatar', status: 'attached', id: { not: upload.id } },
      select: { id: true, key: true },
    })
    await tx.upload.deleteMany({ where: { id: { in: previous.map((row) => row.id) } } })
    await tx.upload.update({
      where: { id: upload.id },
      data: { status: 'attached', size: head.size, contentType: head.contentType ?? undefined },
    })
    const updated = await tx.user.update({
      where: { id: viewer.id },
      data: { image: publicUrl(upload.key) },
      select: currentUserSelect,
    })
    return [previous, updated] as const
  })

  await invalidateTags(userTag(viewer.id))
  for (const { key } of replaced) {
    // The row is already gone; a failure to queue leaves an orphaned object, never a broken avatar.
    enqueue('delete-object', { key }).catch((error) =>
      console.error('[uploads] old avatar not queued for deletion:', error),
    )
  }
  return user
}
