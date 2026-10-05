import { z } from 'zod'

export const AVATAR_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const AVATAR_MAX_SIZE = 2 * 1024 * 1024

export const createAvatarUploadInput = z.object({
  contentType: z.enum(AVATAR_CONTENT_TYPES, { error: 'Use a PNG, JPEG, or WebP image' }),
  size: z
    .number()
    .int()
    .positive('The file is empty')
    .max(AVATAR_MAX_SIZE, 'The image must be 2 MB or smaller'),
})

export type CreateAvatarUploadInput = z.infer<typeof createAvatarUploadInput>

/** Where and how the browser sends the file: a presigned POST to S3, plus the upload's id. */
export const uploadTicketSchema = z.object({
  uploadId: z.string(),
  url: z.string(),
  fields: z.record(z.string(), z.string()),
})

export type UploadTicket = z.infer<typeof uploadTicketSchema>

export const uploadIdSchema = z.uuid('Invalid upload')
