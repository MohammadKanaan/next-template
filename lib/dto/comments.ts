import { z } from 'zod'
import { permissionsSchema } from './common'
import { userProfileSchema } from './users'

export const COMMENT_BODY_MAX_LENGTH = 1000

export const createCommentInput = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Comment is required')
    .max(COMMENT_BODY_MAX_LENGTH, `Comment must be ${COMMENT_BODY_MAX_LENGTH} characters or fewer`),
})

export type CreateCommentInput = z.infer<typeof createCommentInput>

/** A comment without the viewer-specific `permissions`: the part that is safe to cache for everyone. */
export const commentBaseSchema = z.object({
  id: z.number().int(),
  body: z.string(),
  createdAt: z.coerce.date(),
  author: userProfileSchema,
})

export type CommentBase = z.infer<typeof commentBaseSchema>

/** What the viewer may do with one comment (only deleting exists). */
export const commentPermissionsSchema = permissionsSchema.pick({ delete: true })

export const commentSchema = commentBaseSchema.extend({ permissions: commentPermissionsSchema })

export type Comment = z.infer<typeof commentSchema>

export const commentsBaseSchema = z.array(commentBaseSchema)
