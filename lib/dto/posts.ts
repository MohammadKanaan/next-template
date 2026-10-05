import { z } from 'zod'
import { pageQuerySchema, permissionsSchema } from './common'
import { userProfileSchema } from './users'

export const POST_TITLE_MAX_LENGTH = 200
export const POST_BODY_MAX_LENGTH = 5000
export const POST_EXCERPT_LENGTH = 160

export const createPostInput = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(POST_TITLE_MAX_LENGTH, `Title must be ${POST_TITLE_MAX_LENGTH} characters or fewer`),
  body: z
    .string()
    .trim()
    .min(1, 'Body is required')
    .max(POST_BODY_MAX_LENGTH, `Body must be ${POST_BODY_MAX_LENGTH} characters or fewer`),
})

export type CreatePostInput = z.infer<typeof createPostInput>

export const updatePostInput = createPostInput
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one attribute')

export type UpdatePostInput = z.infer<typeof updatePostInput>

export const listPostsQuery = pageQuerySchema.extend({
  authorId: z.string().min(1).optional(),
})

export type ListPostsQuery = z.infer<typeof listPostsQuery>

/** List variant: excerpt instead of body. */
export const postSummarySchema = z.object({
  id: z.number().int(),
  title: z.string(),
  excerpt: z.string(),
  createdAt: z.coerce.date(),
  author: userProfileSchema,
})

export type PostSummary = z.infer<typeof postSummarySchema>

/** Detail variant: full body, timestamps, and what the viewer may do. */
export const postDetailSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  body: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  author: userProfileSchema,
  permissions: permissionsSchema,
})

export type PostDetail = z.infer<typeof postDetailSchema>
