import 'server-only'
import { randomUUID } from 'node:crypto'
import {
  createUploadInput,
  type CreateUploadInput,
  isAllowedContentType,
  objectDeleteDelaySeconds,
  UPLOAD_RULES,
  uploadIdSchema,
  type UploadPurpose,
  type UploadTicket,
  UPLOAD_OBJECT_GRACE_SECONDS,
} from '@/lib/dto/uploads'
import { currentUserSchema, type CurrentUser } from '@/lib/dto/users'
import { invalidateTags } from '@/lib/server/cache'
import { logger } from '@/lib/server/logger'
import { enqueue } from '@/lib/server/queue'
import {
  createUploadTicket,
  deleteObject,
  headObject,
  isStorageConfigured,
  publicUrl,
} from '@/lib/server/storage'
import { requireUser, toRole } from './auth'
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

/** Whether the upload controls should be offered. Public: it only says what `/settings` can do. */
export const canUpload = (): boolean => isStorageConfigured()

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
 * Signed in → input valid for its purpose → returns a presigned PUT for a new object and the
 * pending upload's id. Pending uploads of that purpose whose ticket expired more than
 * `UPLOAD_OBJECT_GRACE_SECONDS` ago are reclaimed first (object, then row). Rows in between (ticket
 * expired, upload possibly still arriving) are neither counted nor touched; the hourly cleanup or a
 * later ticket gets them. When the viewer still holds `maxPending` live ones for the purpose, the
 * request is refused with `RateLimitedError`, so the per-user backlog is bounded here, not only by
 * the hourly cleanup.
 */
export const createUpload = async (input: CreateUploadInput): Promise<UploadTicket> => {
  const viewer = await requireUser()
  const { purpose, contentType, size } = parseInput(createUploadInput, input)
  if (!isStorageConfigured()) {
    throw new ValidationError({ base: ['Uploads are not available'] }, 'Uploads are not available')
  }
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
    data: { key, userId: viewer.id, purpose, contentType, size },
    select: { id: true },
  })
  const ticket = await createUploadTicket({
    key,
    contentType,
    size,
    expiresIn: rule.ticketSeconds,
  })
  return { uploadId: upload.id, ...ticket }
}

/**
 * Signed in, input valid, upload exists (and is of `purpose`), and it is the viewer's own, in that
 * order. Not even an admin may use someone else's upload.
 */
const requireOwnUpload = async (uploadId: string, purpose: UploadPurpose) => {
  const viewer = await requireUser()
  const id = parseInput(uploadIdSchema, uploadId)
  const upload = await db.upload.findUnique({
    where: { id },
    select: { id: true, key: true, userId: true, purpose: true, status: true },
  })
  if (!upload || upload.purpose !== purpose) {
    throw new NotFoundError('Upload not found')
  }
  if (upload.userId !== viewer.id) {
    throw new ForbiddenError('You cannot use this upload')
  }
  return { viewer, upload }
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
 * (the signed ticket should already have enforced them); the replaced avatar's object is removed
 * by a delayed job (see `deleteObjectAfterTicket`), because the bucket call is slow and may fail
 * independently.
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
  return currentUserSchema.parse({ ...user, role: toRole(user.role) })
}
