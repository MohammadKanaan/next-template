import { z } from 'zod'

export const AVATAR_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const AVATAR_MAX_SIZE = 2 * 1024 * 1024
export const ATTACHMENT_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/csv',
] as const
export const ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024
/** Seconds an upload ticket (presigned POST) stays valid. */
export const UPLOAD_TICKET_SECONDS = 300
/**
 * How long after a ticket expires an object is still treated as "may still be arriving": S3 checks
 * a presigned POST's expiry when the request starts, so a slow upload begun just before expiry can
 * land afterwards. Nothing deletes an uploaded object (or its row) before the ticket plus this grace.
 */
export const UPLOAD_OBJECT_GRACE_SECONDS = 600
/** The most attachments a post can hold. */
export const POST_ATTACHMENTS_MAX = 10
/** Longest file name kept (the database column is `VARCHAR(255)`). */
export const UPLOAD_NAME_MAX_LENGTH = 255

export const uploadPurposeSchema = z.enum(['avatar', 'attachment'])

export type UploadPurpose = z.infer<typeof uploadPurposeSchema>

/** What an upload of one purpose may be. `maxPending` caps the live tickets one user holds. */
export type UploadRule = {
  contentTypes: readonly string[]
  maxSize: number
  maxPending: number
  ticketSeconds: number
  /** Shown when the file's type or size is not allowed (and as the hint beside the picker). */
  typeError: string
  sizeError: string
}

/**
 * The one definition of what each purpose accepts: the DTO refines against it, the DAL reads its
 * limits from it and the uploader components take `accept` and the size from it.
 */
export const UPLOAD_RULES: Record<UploadPurpose, UploadRule> = {
  avatar: {
    contentTypes: AVATAR_CONTENT_TYPES,
    maxSize: AVATAR_MAX_SIZE,
    maxPending: 3,
    ticketSeconds: UPLOAD_TICKET_SECONDS,
    typeError: 'Use a PNG, JPEG, or WebP image',
    sizeError: 'The image must be 2 MB or smaller',
  },
  attachment: {
    contentTypes: ATTACHMENT_CONTENT_TYPES,
    maxSize: ATTACHMENT_MAX_SIZE,
    maxPending: 5,
    ticketSeconds: UPLOAD_TICKET_SECONDS,
    typeError: 'Use a PNG, JPEG, WebP or GIF image, a PDF, or a CSV file',
    sizeError: 'The file must be 10 MB or smaller',
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

const uploadNameSchema = z
  .string()
  .trim()
  .min(1, 'The file needs a name')
  .max(
    UPLOAD_NAME_MAX_LENGTH,
    `The file name must be ${UPLOAD_NAME_MAX_LENGTH} characters or fewer`,
  )

/**
 * Asks for an upload ticket. The type and size are checked against the rule of the `purpose`;
 * an attachment also needs its file `name` and the `postId` it is for (an avatar ignores both).
 */
export const createUploadInput = z
  .object({
    purpose: uploadPurposeSchema,
    contentType: z.string(),
    size: z.number().int().positive('The file is empty'),
    name: uploadNameSchema.optional(),
    postId: z.number().int().positive().max(2147483647).optional(),
  })
  .superRefine((value, context) => {
    const rule = UPLOAD_RULES[value.purpose]
    if (!isAllowedContentType(value.purpose, value.contentType)) {
      context.addIssue({ code: 'custom', path: ['contentType'], message: rule.typeError })
    }
    if (value.size > rule.maxSize) {
      context.addIssue({ code: 'custom', path: ['size'], message: rule.sizeError })
    }
    if (value.purpose === 'attachment' && value.name === undefined) {
      context.addIssue({ code: 'custom', path: ['name'], message: 'The file needs a name' })
    }
    if (value.purpose === 'attachment' && value.postId === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['postId'],
        message: 'Choose the post for the file',
      })
    }
  })

export type CreateUploadInput = z.input<typeof createUploadInput>

/** Where and how the browser sends the file: a presigned POST to S3, plus the upload's id. */
export const uploadTicketSchema = z.object({
  uploadId: z.string(),
  url: z.string(),
  fields: z.record(z.string(), z.string()),
})

export type UploadTicket = z.infer<typeof uploadTicketSchema>

export const uploadIdSchema = z.uuid('Invalid upload')

/** A file attached to a post. */
export const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  contentType: z.string(),
  size: z.number().int(),
  createdAt: z.coerce.date(),
})

export type Attachment = z.infer<typeof attachmentSchema>
