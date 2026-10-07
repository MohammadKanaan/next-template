import 'server-only'
import { randomUUID } from 'node:crypto'
import {
  AVATAR_CONTENT_TYPES,
  AVATAR_MAX_SIZE,
  AVATAR_UPLOAD_TICKET_SECONDS,
  createAvatarUploadInput,
  type CreateAvatarUploadInput,
  uploadIdSchema,
  type UploadTicket,
} from '@/lib/dto/uploads'
import type { CurrentUser } from '@/lib/dto/users'
import { invalidateTags } from '@/lib/server/cache'
import { logger } from '@/lib/server/logger'
import { enqueue } from '@/lib/server/queue'
import { createUploadTicket, deleteObject, headObject, publicUrl } from '@/lib/server/storage'
import { requireUser } from './auth'
import { userTag } from './cacheTags'
import { db } from './db'
import {
  ForbiddenError,
  NotFoundError,
  parseInput,
  RateLimitedError,
  ValidationError,
} from './errors'
import { currentUserSelect } from './users'

const log = logger.child({ module: 'uploads' })

/**
 * Pending avatar uploads one user may hold with a ticket that can still be used. Tickets are cheap
 * and every object may be 2 MB, so the per-user backlog is bounded here, not only by the hourly
 * cleanup. A row is never dropped while its ticket is valid: the browser could still upload to the
 * key, and an object without a row is invisible to the cleanup, avatar replacement and account
 * deletion. Past the cap, the user waits for a ticket to expire or finishes one.
 */
const MAX_PENDING_AVATAR_UPLOADS = 3

/**
 * Signed in → returns a presigned POST for a new avatar object and the pending upload's id. Pending
 * uploads whose ticket has expired are reclaimed first (object, then row); when the viewer still
 * holds `MAX_PENDING_AVATAR_UPLOADS` live ones, the request is refused with `RateLimitedError`.
 */
export const createAvatarUpload = async (input: CreateAvatarUploadInput): Promise<UploadTicket> => {
  const viewer = await requireUser()
  const { contentType, size } = parseInput(createAvatarUploadInput, input)

  const pending = await db.upload.findMany({
    where: { userId: viewer.id, purpose: 'avatar', status: 'pending' },
    select: { id: true, key: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const expiredBefore = Date.now() - AVATAR_UPLOAD_TICKET_SECONDS * 1000
  const expired = pending.filter((upload) => upload.createdAt.getTime() < expiredBefore)
  // Object first, so a storage failure leaves the row for the cleanup job.
  for (const stale of expired) {
    await deleteObject(stale.key)
    await db.upload.delete({ where: { id: stale.id } })
  }
  if (pending.length - expired.length >= MAX_PENDING_AVATAR_UPLOADS) {
    throw new RateLimitedError('Finish or wait for your pending uploads before starting another')
  }

  const key = `avatars/${viewer.id}/${randomUUID()}`
  const upload = await db.upload.create({
    data: { key, userId: viewer.id, purpose: 'avatar', contentType, size },
    select: { id: true },
  })
  const ticket = await createUploadTicket({
    key,
    contentType,
    maxSize: AVATAR_MAX_SIZE,
    expiresIn: AVATAR_UPLOAD_TICKET_SECONDS,
  })
  return { uploadId: upload.id, ...ticket }
}

const isAvatarContentType = (value: string | null): boolean => {
  return AVATAR_CONTENT_TYPES.some((type) => type === value)
}

/** Signed in, upload exists, and it is the viewer's own — in that order. */
const requireOwnUpload = async (uploadId: string) => {
  const viewer = await requireUser()
  const id = parseInput(uploadIdSchema, uploadId)
  const upload = await db.upload.findUnique({
    where: { id },
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
export const attachAvatar = async (uploadId: string): Promise<CurrentUser> => {
  const { viewer, upload } = await requireOwnUpload(uploadId)
  if (upload.status !== 'pending') {
    throw new ValidationError({ uploadId: ['This upload was already used'] })
  }

  const head = await headObject(upload.key)
  if (!head) {
    throw new ValidationError({ uploadId: ['The file was not uploaded'] })
  }
  if (head.size < 1 || head.size > AVATAR_MAX_SIZE || !isAvatarContentType(head.contentType)) {
    // Never keep an object that broke the rules. The row stays pending: the ticket may still be
    // valid for another upload to this key, which the hourly cleanup removes after 24 hours, and
    // the row keeps counting toward the pending cap until the ticket expires.
    await deleteObject(upload.key)
    throw new ValidationError({ uploadId: ['The image must be a PNG, JPEG, or WebP up to 2 MB'] })
  }

  const [replaced, user] = await db.$transaction(async (tx) => {
    // Updating the user first takes its row lock, so two attaches by the same user run one after
    // the other and the later one sees (and replaces) the earlier avatar.
    const updated = await tx.user.update({
      where: { id: viewer.id },
      data: { image: publicUrl(upload.key) },
      select: currentUserSelect,
    })
    // Only a still-pending upload can be claimed: a concurrent attach of the same upload matches
    // nothing here and fails, which rolls back the user update above.
    const claimed = await tx.upload.updateMany({
      where: { id: upload.id, status: 'pending' },
      data: { status: 'attached', size: head.size, contentType: head.contentType ?? undefined },
    })
    if (claimed.count === 0) {
      throw new ValidationError({ uploadId: ['This upload was already used'] })
    }
    const previous = await tx.upload.findMany({
      where: { userId: viewer.id, purpose: 'avatar', status: 'attached', id: { not: upload.id } },
      select: { id: true, key: true },
    })
    await tx.upload.deleteMany({ where: { id: { in: previous.map((row) => row.id) } } })
    return [previous, updated] as const
  })

  await invalidateTags(userTag(viewer.id))
  for (const { key } of replaced) {
    // The row is already gone; a failure to queue leaves an orphaned object, never a broken avatar.
    enqueue('delete-object', { key }).catch((error) =>
      log.error({ err: error, key }, 'old avatar not queued for deletion'),
    )
  }
  return user
}
