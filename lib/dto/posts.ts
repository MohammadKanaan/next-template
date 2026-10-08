import { z } from 'zod'
import { idSchema, pageQuerySchema, pageSchema, permissionsSchema } from './common'
import { attachmentSchema } from './uploads'
import { userIdSchema, userProfileSchema } from './users'

export const POST_TITLE_MAX_LENGTH = 200
export const POST_BODY_MAX_LENGTH = 5000
export const POST_EXCERPT_LENGTH = 160
export const POST_SEARCH_MAX_LENGTH = 100
export const POST_TAGS_MAX = 5
export const TAG_NAME_MAX_LENGTH = 30

/** Tags are stored lowercased and trimmed, so `React` and `react ` are the same tag. */
export const normalizeTagName = (name: string) => name.trim().toLowerCase()

export const tagNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'A tag cannot be empty')
  .max(TAG_NAME_MAX_LENGTH, `A tag must be ${TAG_NAME_MAX_LENGTH} characters or fewer`)

export const postStatusSchema = z.enum(['draft', 'published', 'archived'])

export type PostStatus = z.infer<typeof postStatusSchema>

/**
 * The status workflow, defined once: the DAL enforces it (`setPostStatus`) and the UI offers only
 * these moves. Unpublishing keeps `publishedAt`; it records the first publication.
 */
export const POST_STATUS_TRANSITIONS: Record<PostStatus, readonly PostStatus[]> = {
  draft: ['published'],
  published: ['archived', 'draft'],
  archived: ['published'],
}

export const canTransitionPostStatus = (from: PostStatus, to: PostStatus) => {
  return POST_STATUS_TRANSITIONS[from].includes(to)
}

export const setPostStatusInput = z.object({ id: idSchema, status: postStatusSchema })

/** Lowercased, de-duplicated names. */
const postTagsSchema = z
  .array(tagNameSchema)
  .max(POST_TAGS_MAX, `Use at most ${POST_TAGS_MAX} tags`)
  .transform((names) => [...new Set(names)])

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
  tags: postTagsSchema,
})

/**
 * The version of the post the caller read (`PostDetail.version`). A title, body or tags edit
 * carries it, and the DAL applies the edit only if the post still has it (optimistic locking).
 */
export const postVersionSchema = z.number().int().positive()

/** New posts always start as drafts; `tags` may be omitted (no tags). */
export const createPostInput = postFieldsSchema.extend({ tags: postTagsSchema.default([]) })

/** What `createPost` accepts: `tags` may be omitted. */
export type CreatePostParams = z.input<typeof createPostInput>

/** The parsed values: `tags` is always present. The form works with this shape. */
export type CreatePostInput = z.output<typeof createPostInput>

/**
 * What the post form holds: the new-post fields, plus the `version` of the post being edited (set
 * when an existing post is hydrated, absent for a new one).
 */
export const postFormInput = createPostInput.extend({ version: postVersionSchema.optional() })

export type PostFormParams = z.input<typeof postFormInput>

export type PostFormInput = z.output<typeof postFormInput>

/**
 * `version` is required; every other field is optional. Omitting `tags` leaves the post's tags as
 * they are, `[]` clears them. At least one of title, body or tags must be present.
 */
export const updatePostInput = postFieldsSchema
  .partial()
  .extend({ version: postVersionSchema })
  .refine(
    ({ version: _version, ...fields }) => Object.keys(fields).length > 0,
    'Provide at least one attribute',
  )

export type UpdatePostInput = z.input<typeof updatePostInput>

/**
 * `relevance` ranks the matches of a search and is the default while `q` is set; without a search
 * it means `newest`.
 */
export const postsSortSchema = z.enum(['newest', 'oldest', 'relevance'])

export type PostsSort = z.infer<typeof postsSortSchema>

/** `true` / `false` as a boolean or as the string a query string carries. */
const trashFlagSchema = z.union([z.boolean(), z.stringbool()])

/** A calendar day as `YYYY-MM-DD` (what a native date input produces); invalid days are rejected. */
const isoDaySchema = z.iso.date()

export const listPostsQuery = pageQuerySchema.extend({
  authorId: userIdSchema.optional(),
  /** Full-text search over title and body (web search syntax); bounded because it is free text. */
  q: z.string().trim().max(POST_SEARCH_MAX_LENGTH).optional(),
  /** Omitted means `relevance` while searching and `newest` otherwise; see `resolvePostsSort`. */
  sort: postsSortSchema.optional(),
  /** Only an admin or an author listing their own posts may choose a status; see `listPosts`. */
  status: postStatusSchema.optional(),
  tag: tagNameSchema.optional(),
  /** Created on or after this day (UTC). */
  from: isoDaySchema.optional(),
  /** Created on or before this day (UTC), inclusive. */
  to: isoDaySchema.optional(),
  /**
   * The trash instead of the live posts. Honoured only on the viewer's own list and for an admin
   * (like `status`); ignored for everyone else. A real boolean or the strings `true` / `false`
   * (a query string), never `z.coerce.boolean()`, which reads `'false'` as true.
   */
  trash: trashFlagSchema.default(false),
})

export type ListPostsQuery = z.infer<typeof listPostsQuery>

/** What callers pass to `listPosts` / `fetchPosts`: `trash` has a schema default, so it may be omitted. */
export type ListPostsParams = Omit<ListPostsQuery, 'trash'> & Partial<Pick<ListPostsQuery, 'trash'>>

/** The order a list uses: the asked one, else relevance while searching, else newest first. */
export const resolvePostsSort = (
  sort: PostsSort | '' | undefined,
  searching: boolean,
): PostsSort => {
  if (sort === 'newest' || sort === 'oldest') {
    return sort
  }
  return searching ? 'relevance' : 'newest'
}

/**
 * The tolerant URL contract of the post lists: every field falls back to its default, so any
 * query string parses (`?sort=garbage&page=abc` is the default list). Used by the SSR page's
 * `searchParams` and by `useUrlState` in the views, so there is one contract for the URL.
 */
export const postsUrlQuery = z.object({
  page: pageQuerySchema.shape.page.catch(1),
  q: z.string().trim().max(POST_SEARCH_MAX_LENGTH).catch(''),
  /** `''` is the default for the list: relevance while searching, newest otherwise. */
  sort: z.union([postsSortSchema, z.literal('')]).catch(''),
  /** `''` means no filter, so an absent or garbled param and "all" look the same in the URL. */
  status: z.union([postStatusSchema, z.literal('')]).catch(''),
  tag: tagNameSchema.catch(''),
  from: isoDaySchema.catch(''),
  to: isoDaySchema.catch(''),
  trash: trashFlagSchema.catch(false),
})

type PostsUrlQuery = z.infer<typeof postsUrlQuery>

/** True when any filter (everything but `page` and `sort`) is set. */
export const hasActivePostFilters = (
  query: Pick<PostsUrlQuery, 'q' | 'status' | 'tag' | 'from' | 'to'> &
    Partial<Pick<PostsUrlQuery, 'trash'>>,
) => {
  return Boolean(query.q || query.status || query.tag || query.from || query.to || query.trash)
}

/** Turns the URL state into list params: `''` (no filter) becomes `undefined`. `perPage` is the caller's. */
export const toListPostsParams = (
  query: Omit<PostsUrlQuery, 'trash'> & Partial<Pick<PostsUrlQuery, 'trash'>>,
): Omit<ListPostsParams, 'perPage'> => {
  return {
    page: query.page,
    sort: query.sort || undefined,
    q: query.q || undefined,
    status: query.status || undefined,
    tag: query.tag || undefined,
    from: query.from || undefined,
    to: query.to || undefined,
    trash: query.trash,
  }
}

/** List variant: excerpt instead of body. */
export const postSummarySchema = z.object({
  id: z.number().int(),
  title: z.string(),
  excerpt: z.string(),
  status: postStatusSchema,
  tags: z.array(z.string()),
  commentCount: z.number().int(),
  createdAt: z.coerce.date(),
  author: userProfileSchema,
})

export type PostSummary = z.infer<typeof postSummarySchema>

/** What the viewer may do with a post; `restore` is only true for a trashed post. */
export const postPermissionsSchema = permissionsSchema.extend({ restore: z.boolean() })

/** Detail variant: full body, timestamps, and what the viewer may do. */
export const postDetailSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  body: z.string(),
  status: postStatusSchema,
  /** Bumped by every title, body or tags edit; send it back with the next edit. */
  version: postVersionSchema,
  tags: z.array(z.string()),
  commentCount: z.number().int(),
  /** Files attached to the post, oldest first; visible to everyone who can see the post. */
  attachments: z.array(attachmentSchema),
  publishedAt: z.coerce.date().nullable(),
  /** Set while the post is in the trash; only its author and admins can read such a post. */
  deletedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  author: userProfileSchema,
  permissions: postPermissionsSchema,
})

export type PostDetail = z.infer<typeof postDetailSchema>

/** What a post list returns; shared by the DAL's cache and the client facade. */
export const postsPageSchema = pageSchema(postSummarySchema)

/** A detail without the viewer-specific `permissions`: the part that is safe to cache for everyone. */
export const postDetailBaseSchema = postDetailSchema.omit({ permissions: true })

export type PostDetailBase = z.infer<typeof postDetailBaseSchema>

/** A tag with how many published posts use it. */
export const tagSummarySchema = z.object({ name: z.string(), postCount: z.number().int() })

export type TagSummary = z.infer<typeof tagSummarySchema>

export const tagSummariesSchema = z.array(tagSummarySchema)
