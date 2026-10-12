import 'server-only'
import { randomUUID } from 'node:crypto'
import { HOUR } from '@/lib/constants-time'
import {
  createUploadInput,
  type CreateUploadInput,
  isAllowedContentType,
  objectDeleteDelaySeconds,
  UPLOAD_RULES,
  uploadKeySchema,
  type UploadPurpose,
  type UploadTicket,
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
  keyFromPublicUrl,
  publicUrl,
} from '@/lib/server/storage'
import { requireAdmin, requireUser, toRole, type SessionUser } from './auth'
import { userTag } from './cacheTags'
import { db } from './db'
import { ForbiddenError, parseInput, ValidationError } from './errors'
import { consumeRateLimit } from './rateLimit'
import { currentUserSelect } from './users'

// There is no table of uploads: an object's key is `<purpose>s/<user id>/<random UUID>`, so the key
// alone says whose it is and what it is for, and the record that uses it (`users.image`) stores its
// public URL. A ticket whose file is never attached leaves its object in the bucket; the rate limit
// on `createUpload` bounds how many one user can leave.

const log = logger.child({ module: 'uploads' })

/** Tickets one user may ask for per hour. Each can leave an unattached object behind. */
const UPLOAD_TICKET_LIMIT = { max: 10, windowMs: HOUR * 1000 }

/** Whether the upload controls should be offered. Public: it only says what `/settings` can do. */
export const canUpload = (): boolean => isStorageConfigured()

/**
 * Queues the deletion of an uploaded object only once its ticket can no longer be used (the
 * ticket's lifetime plus `UPLOAD_OBJECT_GRACE_SECONDS`): until then the browser could still upload
 * to the key again, and that object would never be deleted. pg-boss reads a numeric `startAfter` as
 * seconds. Shared by every `attachXxx` function.
 */
export const deleteObjectAfterTicket = (key: string, purpose: UploadPurpose) => {
  return enqueue('delete-object', { key }, { startAfter: objectDeleteDelaySeconds(purpose) })
}

/**
 * Signed in → within the ticket rate limit → input valid for its purpose → allowed for that purpose
 * (an `adminOnly` purpose answers 403 to anyone else) → returns a presigned PUT for a new object
 * under the viewer's own prefix, and its key.
 */
export const createUpload = async (input: CreateUploadInput): Promise<UploadTicket> => {
  const viewer = await requireUser()
  await consumeRateLimit(`upload:user:${viewer.id}`, UPLOAD_TICKET_LIMIT)
  const { purpose, contentType, size } = parseInput(createUploadInput, input)
  if (UPLOAD_RULES[purpose].adminOnly) {
    await requireAdmin()
  }
  if (!isStorageConfigured()) {
    throw new ValidationError({ base: ['Uploads are not available'] }, 'Uploads are not available')
  }
  const key = `${purpose}s/${viewer.id}/${randomUUID()}`
  const ticket = await createUploadTicket({
    key,
    contentType,
    size,
    expiresIn: UPLOAD_RULES[purpose].ticketSeconds,
  })
  return { key, ...ticket }
}

/**
 * Key valid (422), and the key is the viewer's own and of `purpose` (403), in that order. Not even
 * an admin may attach someone else's object. The caller has already checked the session, so the
 * 401 comes before the 422 whatever the key looks like.
 */
export const requireOwnKey = (viewer: SessionUser, key: string, purpose: UploadPurpose) => {
  const parsed = parseInput(uploadKeySchema, key)
  if (!parsed.startsWith(`${purpose}s/${viewer.id}/`)) {
    throw new ForbiddenError('You cannot use this upload')
  }
  return parsed
}

/**
 * Reads the stored object and checks it against the purpose's rule. An object that broke the rules
 * is deleted at once (its ticket may still be valid for another upload to this key).
 */
export const verifyStoredObject = async (key: string, purpose: UploadPurpose) => {
  const rule = UPLOAD_RULES[purpose]
  const head = await headObject(key)
  if (!head) {
    throw new ValidationError({ key: ['The file was not uploaded'] })
  }
  if (
    head.size < 1 ||
    head.size > rule.maxSize ||
    !isAllowedContentType(purpose, head.contentType)
  ) {
    await deleteObject(key)
    throw new ValidationError({ key: [`${rule.typeError}. ${rule.sizeError}.`] })
  }
}

/**
 * Makes an uploaded object the viewer's avatar. The stored object is checked against the limits
 * (the signed ticket should already have enforced them); the replaced avatar's object is removed
 * by a delayed job (see `deleteObjectAfterTicket`), because the bucket call is slow and may fail
 * independently. A Google profile picture is not ours, so replacing it deletes nothing.
 */
export const attachAvatar = async (key: string): Promise<CurrentUser> => {
  const viewer = await requireUser()
  const ownKey = requireOwnKey(viewer, key, 'avatar')
  await verifyStoredObject(ownKey, 'avatar')

  const [replacedKey, user] = await db.$transaction(async (tx) => {
    // Lock the user row first, so two attaches by the same user run one after the other and the
    // later one sees (and replaces) the earlier avatar instead of losing track of it.
    await tx.$queryRaw`SELECT 1 FROM users WHERE id = ${viewer.id}::uuid FOR UPDATE`
    const previous = await tx.user.findUnique({
      where: { id: viewer.id },
      select: { image: true },
    })
    const updated = await tx.user.update({
      where: { id: viewer.id },
      data: { image: publicUrl(ownKey) },
      select: currentUserSelect,
    })
    return [keyFromPublicUrl(previous?.image ?? null), updated] as const
  })

  await invalidateTags(userTag(viewer.id))
  // Attaching the current avatar again replaces nothing.
  if (replacedKey && replacedKey !== ownKey) {
    // A failure to queue leaves an orphaned object, never a broken avatar.
    deleteObjectAfterTicket(replacedKey, 'avatar').catch((error) =>
      log.error({ err: error, key: replacedKey }, 'old avatar not queued for deletion'),
    )
  }
  return currentUserSchema.parse({ ...user, role: toRole(user.role) })
}
