import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { idSchema, toPage, type Page } from '@/lib/dto/common'
import {
  POST_EXCERPT_LENGTH,
  createPostInput,
  type CreatePostInput,
  listPostsQuery,
  type ListPostsParams,
  postDetailBaseSchema,
  postsPageSchema,
  type PostDetail,
  type PostDetailBase,
  type PostSummary,
  updatePostInput,
  type UpdatePostInput,
} from '@/lib/dto/posts'
import { invalidateTags, remember } from '@/lib/server/cache'
import { getSessionUser, requireUser, type SessionUser } from './auth'
import { POSTS_TAG, postTag } from './cacheTags'
import { db } from './db'
import { escapeLike } from './escapeLike'
import { ForbiddenError, NotFoundError, parseInput } from './errors'
import { userProfileSelect } from './users'

const postSummarySelect = {
  id: true,
  title: true,
  body: true,
  createdAt: true,
  user: { select: userProfileSelect },
} satisfies Prisma.PostSelect

const POSTS_CACHE_TTL = 300

const postDetailSelect = {
  id: true,
  title: true,
  body: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  user: { select: userProfileSelect },
} satisfies Prisma.PostSelect

type PostSummaryRow = Prisma.PostGetPayload<{ select: typeof postSummarySelect }>
type PostDetailRow = Prisma.PostGetPayload<{ select: typeof postDetailSelect }>

export const toExcerpt = (body: string, maxLength = POST_EXCERPT_LENGTH) => {
  return body.length <= maxLength ? body : `${body.slice(0, maxLength).trimEnd()}…`
}

/** Record-level rule: the author or an admin may change a post. */
const canModify = (viewer: SessionUser | null, authorId: string) => {
  return viewer !== null && (viewer.id === authorId || viewer.role === 'admin')
}

const toPostSummary = (row: PostSummaryRow): PostSummary => {
  return {
    id: row.id,
    title: row.title,
    excerpt: toExcerpt(row.body),
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: row.user,
  }
}

/** Adds what this viewer may do with the post; never cached, because it differs per viewer. */
const withPermissions = (post: PostDetailBase, viewer: SessionUser | null): PostDetail => {
  const allowed = canModify(viewer, post.author.id)
  return { ...post, permissions: { update: allowed, delete: allowed } }
}

export const listPosts = async (params: ListPostsParams): Promise<Page<PostSummary>> => {
  const { page, perPage, authorId, q, sort } = parseInput(listPostsQuery, params)
  const where: Prisma.PostWhereInput = {
    ...(authorId ? { userId: authorId } : {}),
    ...(q ? { title: { contains: escapeLike(q), mode: 'insensitive' } } : {}),
  }
  const load = async () => {
    const [rows, totalItems] = await Promise.all([
      db.post.findMany({
        where,
        select: postSummarySelect,
        orderBy: { id: sort === 'oldest' ? 'asc' : 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      db.post.count({ where }),
    ])
    return toPage(rows.map(toPostSummary), totalItems, { page, perPage })
  }
  // Free-text searches are high-cardinality: caching them would mint unbounded keys, so they go
  // straight to the database. Unfiltered lists (and author lists) keep the cache.
  if (q) {
    return load()
  }
  return remember(
    // JSON keeps the parts unambiguous: no author value can spell the unfiltered list's key.
    JSON.stringify(['posts:list', page, perPage, authorId ?? null, sort]),
    { ttl: POSTS_CACHE_TTL, tags: [POSTS_TAG], schema: postsPageSchema },
    load,
  )
}

/** `id` may come straight from a route param; one that is not a valid id is simply not found. */
export const getPost = async (id: number | string): Promise<PostDetail> => {
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) {
    throw new NotFoundError('Post not found')
  }
  const postId = parsedId.data
  const [post, viewer] = await Promise.all([
    // Cached for everyone; `permissions` is added per viewer below, never cached.
    remember(
      `post:${postId}`,
      { ttl: POSTS_CACHE_TTL, tags: [POSTS_TAG, postTag(postId)], schema: postDetailBaseSchema },
      async () => {
        const row = await db.post.findUnique({ where: { id: postId }, select: postDetailSelect })
        if (!row) {
          throw new NotFoundError('Post not found')
        }
        return toPostBase(row)
      },
    ),
    getSessionUser(),
  ])
  return withPermissions(post, viewer)
}

export const createPost = async (input: CreatePostInput): Promise<PostDetail> => {
  const viewer = await requireUser()
  const data = parseInput(createPostInput, input)
  const row = await db.post.create({
    data: { ...data, userId: viewer.id },
    select: postDetailSelect,
  })
  await invalidateTags(POSTS_TAG)
  const post = toPostBase(row)
  return withPermissions(post, viewer)
}

/** The post vanished between the access check and the write (e.g. a concurrent delete). */
const mapMissingRecord = (error: unknown): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
    throw new NotFoundError('Post not found')
  }
  throw error
}

/** The post exists and the viewer may change it — in that order. */
const requirePostChange = async (viewer: SessionUser, id: number) => {
  const post = await db.post.findUnique({ where: { id }, select: { userId: true } })
  if (!post) {
    throw new NotFoundError('Post not found')
  }
  if (!canModify(viewer, post.userId)) {
    throw new ForbiddenError('You cannot change this post')
  }
}

export const updatePost = async (id: number, input: UpdatePostInput): Promise<PostDetail> => {
  const viewer = await requireUser()
  const postId = parseInput(idSchema, id)
  const data = parseInput(updatePostInput, input)
  await requirePostChange(viewer, postId)
  const row = await db.post
    .update({ where: { id: postId }, data, select: postDetailSelect })
    .catch(mapMissingRecord)
  await invalidateTags(POSTS_TAG, postTag(postId))
  const post = toPostBase(row)
  return withPermissions(post, viewer)
}

export const deletePost = async (id: number): Promise<void> => {
  const viewer = await requireUser()
  const postId = parseInput(idSchema, id)
  await requirePostChange(viewer, postId)
  await db.post.delete({ where: { id: postId } }).catch(mapMissingRecord)
  await invalidateTags(POSTS_TAG, postTag(postId))
}
