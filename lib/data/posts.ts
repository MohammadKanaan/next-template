import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { MINUTE } from '@/lib/constants-time'
import { idSchema, toPage, type Page } from '@/lib/dto/common'
import {
  POST_EXCERPT_LENGTH,
  createPostInput,
  listPostsQuery,
  postDetailBaseSchema,
  postsPageSchema,
  updatePostInput,
  type CreatePostParams,
  type ListPostsParams,
  type PostDetail,
  type PostDetailBase,
  type PostSummary,
  type UpdatePostInput,
} from '@/lib/dto/posts'
import { toExcerpt } from '@/lib/excerpt'
import { invalidateTags, remember } from '@/lib/server/cache'
import { getSessionUser, requireUser, type SessionUser } from './auth'
import { POSTS_TAG, postTag } from './cacheTags'
import { db } from './db'
import { escapeLike } from './escapeLike'
import { NotFoundError, parseInput } from './errors'
import { postPolicy } from './policies/posts'
import { authorize, permissionsFor } from './policy'
import { consumeRateLimit } from './rateLimit'
import { userProfileSelect } from './users'

export const postSummarySelect = {
  id: true,
  title: true,
  body: true,
  published: true,
  createdAt: true,
  user: { select: userProfileSelect },
} satisfies Prisma.PostSelect

const postDetailSelect = {
  id: true,
  title: true,
  body: true,
  published: true,
  createdAt: true,
  updatedAt: true,
  user: { select: userProfileSelect },
} satisfies Prisma.PostSelect

type PostSummaryRow = Prisma.PostGetPayload<{ select: typeof postSummarySelect }>
type PostDetailRow = Prisma.PostGetPayload<{ select: typeof postDetailSelect }>

const POSTS_CACHE_TTL = 5 * MINUTE

export const toPostSummary = (row: PostSummaryRow): PostSummary => {
  return {
    id: row.id,
    title: row.title,
    // The ellipsis comes on top of `POST_EXCERPT_LENGTH` characters.
    excerpt: toExcerpt(row.body, POST_EXCERPT_LENGTH + 1),
    published: row.published,
    createdAt: row.createdAt,
    author: row.user,
  }
}

/** Everything about a post that does not depend on who is looking. */
const toPostBase = (row: PostDetailRow): PostDetailBase => {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    published: row.published,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: row.user,
  }
}

/** Adds what this viewer may do with the post; never cached, because it differs per viewer. */
const withPermissions = (post: PostDetailBase, viewer: SessionUser | null): PostDetail => {
  const record = { published: post.published, authorId: post.author.id }
  return { ...post, permissions: permissionsFor(postPolicy, ['update', 'delete'], viewer, record) }
}

/**
 * Which posts a list may show: everyone sees published posts; an author listing their own posts
 * (`authorId` is theirs) and admins also see drafts, and only they may narrow with `published`.
 * `undefined` means no filter on `published`.
 */
const resolvePublishedFilter = (
  viewer: SessionUser | null,
  authorId: string | undefined,
  requested: boolean | undefined,
): boolean | undefined => {
  const ownList = viewer !== null && authorId === viewer.id
  if (!ownList && viewer?.role !== 'admin') {
    return true
  }
  return requested
}

/**
 * Lists posts, newest first by default, filtered by author and a case-insensitive title search.
 * Only a published-only list without a search or an author is the same for every viewer and has a
 * bounded key, so only that goes through Redis; a search term or an author id is free text or
 * high cardinality, and a list that shows drafts was shaped by the viewer's identity.
 */
export const listPosts = async (params: ListPostsParams): Promise<Page<PostSummary>> => {
  const {
    page,
    perPage,
    authorId,
    q,
    sort,
    published: requested,
  } = parseInput(listPostsQuery, params)
  const viewer = await getSessionUser()
  const published = resolvePublishedFilter(viewer, authorId, requested)
  const load = async () => {
    const direction = sort === 'oldest' ? 'asc' : 'desc'
    const where: Prisma.PostWhereInput = {
      ...(authorId ? { userId: authorId } : {}),
      ...(published === undefined ? {} : { published }),
      // `escapeLike` makes `%` and `_` literal, so a search is text, never a pattern.
      ...(q ? { title: { contains: escapeLike(q), mode: 'insensitive' } } : {}),
    }
    const [rows, totalItems] = await Promise.all([
      db.post.findMany({
        where,
        select: postSummarySelect,
        // Ids are UUIDv7, which sort by creation time, but only to the millisecond: `id` breaks ties.
        orderBy: [{ createdAt: direction }, { id: direction }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      db.post.count({ where }),
    ])
    return toPage(rows.map(toPostSummary), totalItems, { page, perPage })
  }
  if (q || authorId || published !== true) {
    return load()
  }
  return remember(
    // JSON keeps the parts unambiguous, so no value can spell another list's key.
    JSON.stringify(['posts:list', page, perPage, sort]),
    { ttl: POSTS_CACHE_TTL, tags: [POSTS_TAG], schema: postsPageSchema },
    load,
  )
}

/**
 * The viewer-independent part of a post, cached for everyone, draft or not. Private to this
 * file: `getPost` applies `postPolicy.view` before any of it reaches a viewer. `id` may come
 * straight from a route param; one that is not a valid id is simply not found.
 */
const getPostBase = async (id: string): Promise<PostDetailBase> => {
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) {
    throw new NotFoundError('Post not found')
  }
  const postId = parsedId.data
  return remember(
    `post:${postId}`,
    { ttl: POSTS_CACHE_TTL, tags: [POSTS_TAG, postTag(postId)], schema: postDetailBaseSchema },
    async () => {
      const row = await db.post.findUnique({ where: { id: postId }, select: postDetailSelect })
      if (!row) {
        throw new NotFoundError('Post not found')
      }
      return toPostBase(row)
    },
  )
}

/**
 * A post the viewer may see: a draft that is not theirs (and they are not an admin) is reported as
 * not found, the same answer as a missing post. This is for reads only; a write on someone else's
 * post follows exists (404) → allowed (403), so a stranger who tries to change a draft gets 403.
 */
export const getPost = async (id: string): Promise<PostDetail> => {
  // Cached for everyone; the visibility check and `permissions` follow per viewer, never cached.
  const [post, viewer] = await Promise.all([getPostBase(id), getSessionUser()])
  if (!postPolicy.view(viewer, { published: post.published, authorId: post.author.id })) {
    throw new NotFoundError('Post not found')
  }
  return withPermissions(post, viewer)
}

/** Signed in (401) → input valid (422); rate limited per user so one account cannot flood the lists. */
export const createPost = async (input: CreatePostParams): Promise<PostDetail> => {
  const viewer = await requireUser()
  await consumeRateLimit(`create-post:user:${viewer.id}`, { max: 20, windowMs: MINUTE * 1000 })
  const data = parseInput(createPostInput, input)
  const row = await db.post.create({
    data: { ...data, userId: viewer.id },
    select: postDetailSelect,
  })
  await invalidateTags(POSTS_TAG)
  return withPermissions(toPostBase(row), viewer)
}

/**
 * The post exists and the viewer may do `action` to it, in that order, so a stranger gets 403 (not
 * 404) for an existing post, draft or not.
 */
const requirePostChange = async (viewer: SessionUser, id: string, action: 'update' | 'delete') => {
  const post = await db.post.findUnique({
    where: { id },
    select: { userId: true, published: true },
  })
  if (!post) {
    throw new NotFoundError('Post not found')
  }
  authorize(
    postPolicy[action],
    viewer,
    { published: post.published, authorId: post.userId },
    'You cannot change this post',
  )
}

/** The post vanished between the access check and the write (e.g. a concurrent delete). */
const mapMissingRecord = (error: unknown): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
    throw new NotFoundError('Post not found')
  }
  throw error
}

/** Signed in (401) → input valid (422) → exists (404) → the author or an admin (403). */
export const updatePost = async (id: string, input: UpdatePostInput): Promise<PostDetail> => {
  const viewer = await requireUser()
  const postId = parseInput(idSchema, id)
  const data = parseInput(updatePostInput, input)
  await requirePostChange(viewer, postId, 'update')
  const row = await db.post
    .update({ where: { id: postId }, data, select: postDetailSelect })
    .catch(mapMissingRecord)
  await invalidateTags(POSTS_TAG, postTag(postId))
  return withPermissions(toPostBase(row), viewer)
}

/** Signed in (401) → input valid (422) → exists (404) → the author or an admin (403). */
export const deletePost = async (id: string): Promise<void> => {
  const viewer = await requireUser()
  const postId = parseInput(idSchema, id)
  await requirePostChange(viewer, postId, 'delete')
  await db.post.delete({ where: { id: postId } }).catch(mapMissingRecord)
  await invalidateTags(POSTS_TAG, postTag(postId))
}
