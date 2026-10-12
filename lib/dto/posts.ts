import { z } from 'zod'
import { booleanParamSchema, pageQuerySchema, pageSchema, permissionsSchema } from './common'
import { userIdSchema, userProfileSchema } from './users'

export const POST_TITLE_MAX_LENGTH = 200
export const POST_BODY_MAX_LENGTH = 5000
export const POST_EXCERPT_LENGTH = 160
export const POST_SEARCH_MAX_LENGTH = 100

const postFieldsSchema = z.object({
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
  /** Only published posts are public; a draft is visible to its author and admins. */
  published: z.boolean(),
})

/** A new post is a draft unless `published` is passed. */
export const createPostInput = postFieldsSchema.extend({ published: z.boolean().default(false) })

/** What `createPost` accepts: `published` may be omitted. */
export type CreatePostParams = z.input<typeof createPostInput>

/** The parsed values: `published` is always present. The form works with this shape. */
export type CreatePostInput = z.output<typeof createPostInput>

/** Every field is optional, but at least one must carry a value. */
export const updatePostInput = postFieldsSchema.partial().refine(
  // Defined values, not keys: an explicit `undefined` carries no change.
  (fields) => Object.values(fields).some((value) => value !== undefined),
  'Provide at least one attribute',
)

export type UpdatePostInput = z.input<typeof updatePostInput>

export const postsSortSchema = z.enum(['newest', 'oldest'])

export type PostsSort = z.infer<typeof postsSortSchema>

export const listPostsQuery = pageQuerySchema.extend({
  authorId: userIdSchema.optional(),
  /** Case-insensitive search over the title; bounded because it is free text. */
  q: z.string().trim().max(POST_SEARCH_MAX_LENGTH).optional(),
  sort: postsSortSchema.default('newest'),
  /**
   * Published posts only (`true`) or drafts only (`false`); omitted means every post the viewer may
   * see. Only an author listing their own posts and admins see drafts at all; see `listPosts`.
   */
  published: booleanParamSchema.optional(),
})

export type ListPostsQuery = z.infer<typeof listPostsQuery>

/** What callers pass to `listPosts`: `sort` has a schema default, so it may be omitted. */
export type ListPostsParams = z.input<typeof listPostsQuery>

/**
 * The tolerant URL contract of the post lists: every field falls back to its default, so any
 * query string parses (`?sort=garbage&page=abc` is the default list). Used by the page's
 * `searchParams` and by `useUrlState` in the view, so there is one contract for the URL.
 */
export const postsUrlQuery = z.object({
  page: pageQuerySchema.shape.page.catch(1),
  q: z.string().trim().max(POST_SEARCH_MAX_LENGTH).catch(''),
  sort: postsSortSchema.catch('newest'),
})

export type PostsUrlQuery = z.infer<typeof postsUrlQuery>

/** Turns the URL state into list params: `''` (no search) becomes `undefined`. `perPage` is the caller's. */
export const toListPostsParams = (query: PostsUrlQuery): Omit<ListPostsParams, 'perPage'> => {
  return { page: query.page, sort: query.sort, q: query.q || undefined }
}

/** List variant: excerpt instead of body. */
export const postSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  excerpt: z.string(),
  published: z.boolean(),
  createdAt: z.coerce.date(),
  author: userProfileSchema,
})

export type PostSummary = z.infer<typeof postSummarySchema>

/** Detail variant: full body, timestamps, and what the viewer may do. */
export const postDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  published: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  author: userProfileSchema,
  permissions: permissionsSchema,
})

export type PostDetail = z.infer<typeof postDetailSchema>

/** What a post list returns; the DAL's cache parses entries with it. */
export const postsPageSchema = pageSchema(postSummarySchema)

/** A detail without the viewer-specific `permissions`: the part that is safe to cache for everyone. */
export const postDetailBaseSchema = postDetailSchema.omit({ permissions: true })

export type PostDetailBase = z.infer<typeof postDetailBaseSchema>
