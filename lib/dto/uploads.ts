import { z } from 'zod'
import { MINUTE } from '@/lib/constants-time'

export const AVATAR_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const AVATAR_MAX_SIZE = 2 * 1024 * 1024
/** Seconds an upload ticket (presigned PUT) stays valid. */
export const UPLOAD_TICKET_SECONDS = 5 * MINUTE
/**
 * How long after a ticket expires an object is still treated as "may still be arriving": storage
 * checks a presigned URL's expiry when the request starts, so a slow upload begun just before
 * expiry can land afterwards. Nothing deletes a replaced object before the ticket plus this
 * grace, so it cannot be uploaded again after its delete job ran.
 */
export const UPLOAD_OBJECT_GRACE_SECONDS = 10 * MINUTE

/** Every kind of file the app stores. A new kind is a value here and a row in `UPLOAD_RULES`. */
export const uploadPurposeSchema = z.enum(['avatar'])

export type UploadPurpose = z.infer<typeof uploadPurposeSchema>

/** What an upload of one purpose may be. */
export type UploadRule = {
  contentTypes: readonly string[]
  maxSize: number
  ticketSeconds: number
  /** Whether only an admin may ask for a ticket (the DAL checks it after the input). */
  adminOnly: boolean
  /** Shown when the file's type or size is not allowed (and as the hint beside the picker). */
  typeError: string
  sizeError: string
}

/**
 * The one definition of what each purpose accepts: the DTO refines against it, the DAL reads its
 * limits from it and the uploader components take `accept` and the size from it. No SVG or HTML
 * anywhere: the bucket serves files from a public origin, and those execute in the browser.
 */
export const UPLOAD_RULES: Record<UploadPurpose, UploadRule> = {
  avatar: {
    contentTypes: AVATAR_CONTENT_TYPES,
    maxSize: AVATAR_MAX_SIZE,
    ticketSeconds: UPLOAD_TICKET_SECONDS,
    adminOnly: false,
    typeError: 'Use a PNG, JPEG, or WebP image',
    sizeError: 'The image must be 2 MB or smaller',
  },
}

export const isAllowedContentType = (purpose: UploadPurpose, contentType: string | null) => {
  return UPLOAD_RULES[purpose].contentTypes.some((type) => type === contentType)
}

/**
 * Seconds to wait before deleting an object of this purpose: its ticket can no longer be used by
 * then (see `UPLOAD_OBJECT_GRACE_SECONDS`).
 */
export const objectDeleteDelaySeconds = (purpose: UploadPurpose) => {
  return UPLOAD_RULES[purpose].ticketSeconds + UPLOAD_OBJECT_GRACE_SECONDS
}

/** The longest `objectDeleteDelaySeconds`, for deleting objects of any purpose. */
export const MAX_OBJECT_DELETE_DELAY_SECONDS = Math.max(
  ...uploadPurposeSchema.options.map(objectDeleteDelaySeconds),
)

/**
 * Asks for an upload ticket. The type and size are checked against the rule of the `purpose`. The
 * size is exact: the ticket is signed for it, so a file of another size is refused by storage.
 */
export const createUploadInput = z
  .object({
    purpose: uploadPurposeSchema,
    contentType: z.string(),
    size: z.number().int().positive('The file is empty'),
  })
  .superRefine((value, context) => {
    const rule = UPLOAD_RULES[value.purpose]
    if (!isAllowedContentType(value.purpose, value.contentType)) {
      context.addIssue({ code: 'custom', path: ['contentType'], message: rule.typeError })
    }
    if (value.size > rule.maxSize) {
      context.addIssue({ code: 'custom', path: ['size'], message: rule.sizeError })
    }
  })

export type CreateUploadInput = z.input<typeof createUploadInput>

/**
 * Where and how the browser sends the file: a presigned `PUT` whose signature covers the headers
 * below (and the exact `Content-Length`, which the browser sets itself), plus the object's key,
 * which the browser hands back to attach the file.
 */
export const uploadTicketSchema = z.object({
  key: z.string(),
  url: z.string(),
  headers: z.record(z.string(), z.string()),
})

export type UploadTicket = z.infer<typeof uploadTicketSchema>

/**
 * An object key as `createUpload` makes it: `<purpose>s/<user id>/<random UUID>`. The DAL also
 * checks that the key is the viewer's own and of the expected purpose.
 */
export const uploadKeySchema = z
  .string()
  .regex(/^[a-z]+s\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/, 'Invalid upload')
