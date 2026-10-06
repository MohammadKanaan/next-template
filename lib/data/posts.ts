import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { idSchema, toPage, type Page } from '@/lib/dto/common'
import {
  POST_EXCERPT_LENGTH,
  canTransitionPostStatus,
  createPostInput,
  type CreatePostParams,
  listPostsQuery,
  type ListPostsParams,
  postDetailBaseSchema,
  postsPageSchema,
  setPostStatusInput,
  tagSummariesSchema,
  type PostDetail,
  type PostDetailBase,
  type PostStatus,
  type PostSummary,
  type TagSummary,
  updatePostInput,
  type UpdatePostInput,
} from '@/lib/dto/posts'
import { invalidateTags, remember } from '@/lib/server/cache'
import { getSessionUser, requireUser, type SessionUser } from './auth'
import { POSTS_TAG, postTag } from './cacheTags'
import { db } from './db'
import { escapeLike } from './escapeLike'
import { ForbiddenError, NotFoundError, parseInput, ValidationError } from './errors'
import { userProfileSelect } from './users'

/** Tag names, alphabetical so the order is stable. */
const postTagsSelect = {
  select: { tag: { select: { name: true } } },
  orderBy: { tag: { name: 'asc' } },
} as const

const postSummarySelect = {
  id: true,
  title: true,
  body: true,
  status: true,
  createdAt: true,
  user: { select: userProfileSelect },
  tags: postTagsSelect,
  _count: { select: { comments: true } },
} satisfies Prisma.PostSelect

const POSTS_CACHE_TTL = 300
/** Upper bound for `listTags`: tag names are user input, so the list must not grow without limit. */
const TAGS_LIMIT = 100

const postDetailSelect = {
  id: true,
  title: true,
  body: true,
  status: true,
  publishedAt: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  user: { select: userProfileSelect },
  tags: postTagsSelect,
  _count: { select: { comments: true } },
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

/**
 * Record-level rule: only published posts are public. A draft or archived post is visible to its
 * author and to admins; for everyone else it does not exist.
 */
export const canViewPost = (
  viewer: SessionUser | null,
  post: { status: PostStatus; author: { id: string } },
) => {
  return post.status === 'published' || canModify(viewer, post.author.id)
}

const toPostSummary = (row: PostSummaryRow): PostSummary => {
  return {
    id: row.id,
    title: row.title,
    excerpt: toExcerpt(row.body),
    status: row.status,
    tags: row.tags.map(({ tag }) => tag.name),
    commentCount: row._count.comments,
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
    status: row.status,
    tags: row.tags.map(({ tag }) => tag.name),
    commentCount: row._count.comments,
    publishedAt: row.publishedAt,
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

/**
 * Only `published` posts are listed, except for an admin and for an author listing their own
 * posts, who see every status. A result that depends on who is looking never goes through the
 * shared cache.
 */
export const listPosts = async (params: ListPostsParams): Promise<Page<PostSummary>> => {
  const { page, perPage, authorId, q, sort } = parseInput(listPostsQuery, params)
  const viewer = await getSessionUser()
  const seesEveryStatus =
    viewer !== null &&
    (viewer.role === 'admin' || (authorId !== undefined && authorId === viewer.id))
  const where: Prisma.PostWhereInput = {
    ...(authorId ? { userId: authorId } : {}),
    ...(seesEveryStatus ? {} : { status: 'published' }),
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
  // straight to the database. So does anything that varies by viewer (every status visible).
  // Public lists (published only) and public author lists keep the cache.
  if (q || seesEveryStatus) {
    return load()
  }
  return remember(
    // JSON keeps the parts unambiguous: no author value can spell the unfiltered list's key.
    JSON.stringify(['posts:list', page, perPage, authorId ?? null, sort]),
    { ttl: POSTS_CACHE_TTL, tags: [POSTS_TAG], schema: postsPageSchema },
    load,
  )
}

/**
 * The viewer-independent part of a post, cached for everyone, whatever its status. Callers must
 * apply `canViewPost` before they hand any of it to a viewer. `id` may come straight from a route
 * param; one that is not a valid id is simply not found.
 */
export const getPostBase = async (id: number | string): Promise<PostDetailBase> => {
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
 * A post the viewer may see: a draft or archived post that is not theirs (and they are not an
 * admin) is reported as not found, so its existence does not leak.
 */
export const getPost = async (id: number | string): Promise<PostDetail> => {
  // Cached for everyone; the visibility check and `permissions` follow per viewer, never cached.
  const [post, viewer] = await Promise.all([getPostBase(id), getSessionUser()])
  if (!canViewPost(viewer, post)) {
    throw new NotFoundError('Post not found')
  }
  return withPermissions(post, viewer)
}

/** Tags used by published posts, with how many; the same for every viewer, so it is cached. */
export const listTags = async (): Promise<TagSummary[]> => {
  const published = { post: { status: 'published' } } satisfies Prisma.PostTagWhereInput
  return remember(
    'posts:tags',
    { ttl: POSTS_CACHE_TTL, tags: [POSTS_TAG], schema: tagSummariesSchema },
    async () => {
      const rows = await db.tag.findMany({
        where: { posts: { some: published } },
        select: { name: true, _count: { select: { posts: { where: published } } } },
        orderBy: { name: 'asc' },
        take: TAGS_LIMIT,
      })
      return rows.map((row) => ({ name: row.name, postCount: row._count.posts }))
    },
  )
}

/**
 * Makes `names` the post's tags: missing tag rows are created, links that are no longer wanted
 * are dropped. Runs inside the caller's transaction so a post is never left half-tagged. Names are
 * handled in sorted order so concurrent transactions lock tag rows in the same order.
 */
const replacePostTags = async (tx: Prisma.TransactionClient, postId: number, names: string[]) => {
  const tagIds: number[] = []
  for (const name of [...names].sort()) {
    const tag = await tx.tag.upsert({
      where: { name },
      create: { name },
      update: {},
      select: { id: true },
    })
    tagIds.push(tag.id)
  }
  await tx.postTag.deleteMany({ where: { postId, tagId: { notIn: tagIds } } })
  await tx.postTag.createMany({
    data: tagIds.map((tagId) => ({ postId, tagId })),
    skipDuplicates: true,
  })
}

/** A new post is a draft: the author publishes it with `setPostStatus`. */
export const createPost = async (input: CreatePostParams): Promise<PostDetail> => {
  const viewer = await requireUser()
  const { tags, ...data } = parseInput(createPostInput, input)
  // One transaction: the post and its tag links appear together or not at all.
  const row = await db.$transaction(async (tx) => {
    const created = await tx.post.create({
      data: { ...data, userId: viewer.id },
      select: { id: true },
    })
    await replacePostTags(tx, created.id, tags)
    return tx.post.findUniqueOrThrow({ where: { id: created.id }, select: postDetailSelect })
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
  const post = await db.post.findUnique({
    where: { id },
    select: { userId: true, status: true, publishedAt: true },
  })
  if (!post) {
    throw new NotFoundError('Post not found')
  }
  if (!canModify(viewer, post.userId)) {
    throw new ForbiddenError('You cannot change this post')
  }
  return post
}

export const updatePost = async (id: number, input: UpdatePostInput): Promise<PostDetail> => {
  const viewer = await requireUser()
  const postId = parseInput(idSchema, id)
  const { tags, ...data } = parseInput(updatePostInput, input)
  await requirePostChange(viewer, postId)
  const row = await db
    .$transaction(async (tx) => {
      // Prisma skips `@updatedAt` for an empty `data`, so it is set here: a tags-only edit is an edit.
      await tx.post.update({ where: { id: postId }, data: { ...data, updatedAt: new Date() } })
      if (tags !== undefined) {
        await replacePostTags(tx, postId, tags)
      }
      return tx.post.findUniqueOrThrow({ where: { id: postId }, select: postDetailSelect })
    })
    .catch(mapMissingRecord)
  await invalidateTags(POSTS_TAG, postTag(postId))
  const post = toPostBase(row)
  return withPermissions(post, viewer)
}

/**
 * Moves a post along `POST_STATUS_TRANSITIONS`: signed in (401) → exists (404) → the author or an
 * admin (403) → the move is allowed from the current status (422 on `status`). The first
 * publication stamps `publishedAt`. The write is conditional on the status that was checked, so two
 * concurrent moves cannot both succeed.
 */
export const setPostStatus = async (id: number, status: PostStatus): Promise<PostDetail> => {
  const viewer = await requireUser()
  const { id: postId, status: next } = parseInput(setPostStatusInput, { id, status })
  const current = await requirePostChange(viewer, postId)
  if (!canTransitionPostStatus(current.status, next)) {
    throw new ValidationError({
      status: [`A ${current.status} post cannot become ${next}`],
    })
  }
  const moved = await db.post.updateMany({
    where: { id: postId, status: current.status },
    data: {
      status: next,
      ...(next === 'published' && current.publishedAt === null ? { publishedAt: new Date() } : {}),
    },
  })
  if (moved.count === 0) {
    throw new ValidationError({ status: ['The post was changed meanwhile. Reload and try again.'] })
  }
  await invalidateTags(POSTS_TAG, postTag(postId))
  const row = await db.post
    .findUniqueOrThrow({ where: { id: postId }, select: postDetailSelect })
    .catch(mapMissingRecord)
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
