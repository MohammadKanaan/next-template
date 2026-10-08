import 'server-only'
import { randomUUID } from 'node:crypto'
import { idSchema } from '@/lib/dto/common'
import {
  type Attachment,
  createUploadInput,
  type CreateUploadInput,
  isAllowedContentType,
  objectDeleteDelaySeconds,
  POST_ATTACHMENTS_MAX,
  UPLOAD_RULES,
  uploadIdSchema,
  type UploadPurpose,
  type UploadTicket,
  UPLOAD_OBJECT_GRACE_SECONDS,
} from '@/lib/dto/uploads'
import type { CurrentUser } from '@/lib/dto/users'
import { invalidateTags } from '@/lib/server/cache'
import { logger } from '@/lib/server/logger'
import { enqueue } from '@/lib/server/queue'
import { createUploadTicket, deleteObject, headObject, publicUrl } from '@/lib/server/storage'
import { requireUser } from './auth'
import { postTag, userTag } from './cacheTags'
import { db } from './db'
import {
  ForbiddenError,
  NotFoundError,
  parseInput,
  RateLimitedError,
  ValidationError,
} from './errors'
import { requirePostChange } from './posts'
import { currentUserSelect } from './users'

const log = logger.child({ module: 'uploads' })

/**
 * Queues the deletion of an uploaded object only once its ticket can no longer be used (the
 * ticket's lifetime plus `UPLOAD_OBJECT_GRACE_SECONDS`): until then the browser could still upload
 * to the key, and an object re-uploaded after its row and delete job are gone would never be
 * deleted. pg-boss reads a numeric `startAfter` as seconds.
 */
const deleteObjectAfterTicket = (key: string, purpose: UploadPurpose) => {
  return enqueue('delete-object', { key }, { startAfter: objectDeleteDelaySeconds(purpose) })
}

/**
 * Signed in → input valid for its purpose → returns a presigned POST for a new object and the
 * pending upload's id. Pending uploads of that purpose whose ticket expired more than
 * `UPLOAD_OBJECT_GRACE_SECONDS` ago are reclaimed first (object, then row). Rows in between (ticket
 * expired, upload possibly still arriving) are neither counted nor touched; the hourly cleanup or a
 * later ticket gets them. When the viewer still holds `maxPending` live ones for the purpose, the
 * request is refused with `RateLimitedError`. Tickets are cheap and an object may be 10 MB, so the
 * per-user backlog is bounded here, not only by the hourly cleanup.
 */
export const createUpload = async (input: CreateUploadInput): Promise<UploadTicket> => {
  const viewer = await requireUser()
  const { purpose, contentType, size, name } = parseInput(createUploadInput, input)
  const rule = UPLOAD_RULES[purpose]

  const pending = await db.upload.findMany({
    where: { userId: viewer.id, purpose, status: 'pending' },
    select: { id: true, key: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const now = Date.now()
  const liveSince = now - rule.ticketSeconds * 1000
  const reclaimBefore = now - (rule.ticketSeconds + UPLOAD_OBJECT_GRACE_SECONDS) * 1000
  const live = pending.filter((upload) => upload.createdAt.getTime() >= liveSince)
  const expired = pending.filter((upload) => upload.createdAt.getTime() < reclaimBefore)
  // Object first, so a storage failure leaves the row for the cleanup job.
  for (const stale of expired) {
    await deleteObject(stale.key)
    // Only a still-pending row: a concurrent attach may have just claimed it.
    await db.upload.deleteMany({ where: { id: stale.id, status: 'pending' } })
  }
  if (live.length >= rule.maxPending) {
    throw new RateLimitedError('Finish or wait for your pending uploads before starting another')
  }

  const key = `${purpose}s/${viewer.id}/${randomUUID()}`
  const upload = await db.upload.create({
    data: {
      key,
      userId: viewer.id,
      purpose,
      contentType,
      size,
      name: purpose === 'attachment' ? name : null,
    },
    select: { id: true },
  })
  const ticket = await createUploadTicket({
    key,
    contentType,
    maxSize: rule.maxSize,
    expiresIn: rule.ticketSeconds,
  })
  return { uploadId: upload.id, ...ticket }
}

/** The upload exists (and is of `purpose`) and is the viewer's own — in that order. */
const findOwnUpload = async (viewerId: string, id: string, purpose: UploadPurpose) => {
  const upload = await db.upload.findUnique({
    where: { id },
    select: {
      id: true,
      key: true,
      userId: true,
      purpose: true,
      status: true,
      name: true,
      createdAt: true,
    },
  })
  if (!upload || upload.purpose !== purpose) {
    throw new NotFoundError('Upload not found')
  }
  if (upload.userId !== viewerId) {
    throw new ForbiddenError('You cannot use this upload')
  }
  return upload
}

/**
 * Signed in, input valid, upload exists (and is of `purpose`), and it is the viewer's own — in
 * that order.
 */
const requireOwnUpload = async (uploadId: string, purpose: UploadPurpose) => {
  const viewer = await requireUser()
  const id = parseInput(uploadIdSchema, uploadId)
  return { viewer, upload: await findOwnUpload(viewer.id, id, purpose) }
}

/**
 * Reads the stored object and checks it against the purpose's rule. An object that broke the rules
 * is deleted at once; the row stays pending (the ticket may still be valid for another upload to
 * this key). The hourly cleanup removes it after 24 hours, and `createUpload` reclaims it sooner,
 * once it is older than the ticket plus grace; until the ticket expires it keeps counting toward
 * the pending cap.
 */
const verifyStoredObject = async (key: string, purpose: UploadPurpose) => {
  const rule = UPLOAD_RULES[purpose]
  const head = await headObject(key)
  if (!head) {
    throw new ValidationError({ uploadId: ['The file was not uploaded'] })
  }
  if (
    head.size < 1 ||
    head.size > rule.maxSize ||
    !isAllowedContentType(purpose, head.contentType)
  ) {
    await deleteObject(key)
    throw new ValidationError({ uploadId: [`${rule.typeError}. ${rule.sizeError}.`] })
  }
  return head
}

/**
 * Makes a finished upload the viewer's avatar. The stored object is checked against the limits
 * (the presigned policy should already have enforced them); the replaced avatar's object is
 * removed by a delayed job (see `deleteObjectAfterTicket`), because the bucket call is slow and may
 * fail independently.
 */
export const attachAvatar = async (uploadId: string): Promise<CurrentUser> => {
  const { viewer, upload } = await requireOwnUpload(uploadId, 'avatar')
  if (upload.status !== 'pending') {
    throw new ValidationError({ uploadId: ['This upload was already used'] })
  }

  const head = await verifyStoredObject(upload.key, 'avatar')

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
    deleteObjectAfterTicket(key, 'avatar').catch((error) =>
      log.error({ err: error, key }, 'old avatar not queued for deletion'),
    )
  }
  return user
}

/**
 * Attaches a finished `attachment` upload to a post: signed in (401) → input valid (422) → the post
 * exists and is live (404) → `postPolicy.update` (403) → the upload exists (404) and is the
 * viewer's own (403) → still pending (422) → the stored object passes the rule (422) → the post
 * has room (422). Does not bump the post's `version` (attachments are not title, body or tags).
 */
export const attachPostUpload = async (
  postId: number | string,
  uploadId: string,
): Promise<Attachment> => {
  const viewer = await requireUser()
  const id = parseInput(idSchema, postId)
  const uploadKey = parseInput(uploadIdSchema, uploadId)
  await requirePostChange(viewer, id, 'update')
  const upload = await findOwnUpload(viewer.id, uploadKey, 'attachment')
  if (upload.status !== 'pending') {
    throw new ValidationError({ uploadId: ['This upload was already used'] })
  }
  const head = await verifyStoredObject(upload.key, 'attachment')

  const attached = await db.$transaction(async (tx) => {
    // Locking the (live) post serializes attaches to it, so the count below cannot be raced past
    // the maximum, and a post trashed meanwhile is a 404.
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM posts WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`
    if (locked.length === 0) {
      throw new NotFoundError('Post not found')
    }
    const count = await tx.upload.count({
      where: { postId: id, purpose: 'attachment', status: 'attached' },
    })
    if (count >= POST_ATTACHMENTS_MAX) {
      throw new ValidationError({
        uploadId: [`A post can have at most ${POST_ATTACHMENTS_MAX} attachments`],
      })
    }
    // Only a still-pending upload can be claimed: a concurrent attach of the same upload loses.
    const claimed = await tx.upload.updateMany({
      where: { id: upload.id, status: 'pending' },
      data: {
        status: 'attached',
        postId: id,
        size: head.size,
        contentType: head.contentType ?? undefined,
      },
    })
    if (claimed.count === 0) {
      throw new ValidationError({ uploadId: ['This upload was already used'] })
    }
    return tx.upload.findUniqueOrThrow({
      where: { id: upload.id },
      select: { id: true, name: true, key: true, contentType: true, size: true, createdAt: true },
    })
  })

  await invalidateTags(postTag(id))
  return {
    id: attached.id,
    name: attached.name ?? '',
    url: publicUrl(attached.key),
    contentType: attached.contentType,
    size: attached.size,
    createdAt: attached.createdAt,
  }
}

/**
 * Removes an attachment from a post: signed in (401) → input valid (422) → the post exists and is
 * live (404) → `postPolicy.update` (403) → the attachment belongs to the post (404). Whoever may
 * edit the post may remove any of its attachments. The row goes now; the object is deleted by a
 * delayed job (see `deleteObjectAfterTicket`), so it stays readable at its URL for about 15 minutes.
 */
export const detachPostUpload = async (
  postId: number | string,
  uploadId: string,
): Promise<void> => {
  const viewer = await requireUser()
  const id = parseInput(idSchema, postId)
  const uploadKey = parseInput(uploadIdSchema, uploadId)
  await requirePostChange(viewer, id, 'update')
  const upload = await db.upload.findFirst({
    where: { id: uploadKey, postId: id, purpose: 'attachment', status: 'attached' },
    select: { id: true, key: true },
  })
  if (!upload) {
    throw new NotFoundError('Attachment not found')
  }
  const removed = await db.upload.deleteMany({ where: { id: upload.id, postId: id } })
  if (removed.count === 0) {
    throw new NotFoundError('Attachment not found')
  }
  await invalidateTags(postTag(id))
  // The row is already gone; a failure to queue leaves an orphaned object, never a broken post.
  deleteObjectAfterTicket(upload.key, 'attachment').catch((error) =>
    log.error({ err: error, key: upload.key }, 'attachment not queued for deletion'),
  )
}
