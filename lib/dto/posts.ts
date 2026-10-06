import { z } from 'zod'
import { pageQuerySchema, pageSchema, permissionsSchema } from './common'
import { userIdSchema, userProfileSchema } from './users'

export const POST_TITLE_MAX_LENGTH = 200
export const POST_BODY_MAX_LENGTH = 5000
export const POST_EXCERPT_LENGTH = 160
export const POST_SEARCH_MAX_LENGTH = 100

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

export const postsSortSchema = z.enum(['newest', 'oldest'])

export type PostsSort = z.infer<typeof postsSortSchema>

export const listPostsQuery = pageQuerySchema.extend({
  authorId: userIdSchema.optional(),
  /** Case-insensitive title search; bounded because it is free text. */
  q: z.string().trim().max(POST_SEARCH_MAX_LENGTH).optional(),
  sort: postsSortSchema.default('newest'),
})

export type ListPostsQuery = z.infer<typeof listPostsQuery>

/** What callers pass to `listPosts` / `fetchPosts`: `sort` has a schema default, so it may be omitted. */
export type ListPostsParams = Omit<ListPostsQuery, 'sort'> & Partial<Pick<ListPostsQuery, 'sort'>>

/**
 * The tolerant URL contract of the post lists: every field falls back to its default, so any
 * query string parses (`?sort=garbage&page=abc` is the default list). Used by the SSR page's
 * `searchParams` and by `useUrlState` in the views, so there is one contract for the URL.
 */
export const postsUrlQuery = z.object({
  page: pageQuerySchema.shape.page.catch(1),
  q: z.string().trim().max(POST_SEARCH_MAX_LENGTH).catch(''),
  sort: postsSortSchema.catch('newest'),
})

export type PostsUrlQuery = z.infer<typeof postsUrlQuery>

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

/** What a post list returns; shared by the DAL's cache and the client facade. */
export const postsPageSchema = pageSchema(postSummarySchema)

/** A detail without the viewer-specific `permissions`: the part that is safe to cache for everyone. */
export const postDetailBaseSchema = postDetailSchema.omit({ permissions: true })

export type PostDetailBase = z.infer<typeof postDetailBaseSchema>
