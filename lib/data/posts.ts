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
  type ListPostsQuery,
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
import { toExcerpt } from '@/lib/excerpt'
import { invalidateTags, remember } from '@/lib/server/cache'
import { getSessionUser, requireUser, type SessionUser } from './auth'
import { POSTS_TAG, postTag } from './cacheTags'
import { db } from './db'
import { escapeLike } from './escapeLike'
import { NotFoundError, parseInput, ValidationError } from './errors'
import { postPolicy } from './policies/posts'
import { authorize, permissionsFor } from './policy'
import { consumeRateLimit } from './rateLimit'
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
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  user: { select: userProfileSelect },
  tags: postTagsSelect,
  _count: { select: { comments: true } },
} satisfies Prisma.PostSelect

type PostSummaryRow = Prisma.PostGetPayload<{ select: typeof postSummarySelect }>
type PostDetailRow = Prisma.PostGetPayload<{ select: typeof postDetailSelect }>

const toPostSummary = (row: PostSummaryRow): PostSummary => {
  return {
    id: row.id,
    title: row.title,
    // The ellipsis comes on top of `POST_EXCERPT_LENGTH` characters, as the excerpt always did.
    excerpt: toExcerpt(row.body, POST_EXCERPT_LENGTH + 1),
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
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: row.user,
  }
}

/** Adds what this viewer may do with the post; never cached, because it differs per viewer. */
const withPermissions = (post: PostDetailBase, viewer: SessionUser | null): PostDetail => {
  const record = { status: post.status, authorId: post.author.id, deletedAt: post.deletedAt }
  return {
    ...post,
    permissions: permissionsFor(postPolicy, ['update', 'delete', 'restore'], viewer, record),
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Which status a list shows (`undefined` is every status). Only an author listing their own posts
 * and an admin may pick one; the author's own list shows every status unless they narrow it. For
 * everyone else, an admin browsing other people's posts included, it is `published`, whatever was
 * asked.
 */
const resolveStatusFilter = (
  viewer: SessionUser | null,
  authorId: string | undefined,
  requested: PostStatus | undefined,
): PostStatus | undefined => {
  const ownList = viewer !== null && authorId === viewer.id
  if (!ownList && viewer?.role !== 'admin') {
    return 'published'
  }
  return requested ?? (ownList ? undefined : 'published')
}

/**
 * Composes every list condition into one `where`, and returns the status it applied and whether it
 * is the trash, so the caller can tell whether the result depends on the viewer. `from` and `to`
 * are UTC days, both inclusive. The trash is listed only by an admin or by an author listing their
 * own posts (like `status`, a request from anyone else is ignored); there `status` is whatever was
 * asked, no filter by default.
 */
const buildPostWhere = (
  query: Pick<ListPostsQuery, 'authorId' | 'q' | 'status' | 'tag' | 'from' | 'to' | 'trash'>,
  viewer: SessionUser | null,
) => {
  const mayListTrash = viewer !== null && (viewer.role === 'admin' || query.authorId === viewer.id)
  const trashed = query.trash && mayListTrash
  const status = trashed ? query.status : resolveStatusFilter(viewer, query.authorId, query.status)
  const createdAt: Prisma.DateTimeFilter = {}
  if (query.from) {
    createdAt.gte = new Date(`${query.from}T00:00:00.000Z`)
  }
  if (query.to) {
    createdAt.lt = new Date(Date.parse(`${query.to}T00:00:00.000Z`) + DAY_MS)
  }
  const where: Prisma.PostWhereInput = {
    deletedAt: trashed ? { not: null } : null,
    ...(query.authorId ? { userId: query.authorId } : {}),
    ...(status ? { status } : {}),
    ...(query.q ? { title: { contains: escapeLike(query.q), mode: 'insensitive' } } : {}),
    ...(query.tag ? { tags: { some: { tag: { name: query.tag } } } } : {}),
    ...(query.from || query.to ? { createdAt } : {}),
  }
  return { where, status, trashed }
}

/**
 * Lists posts, newest first by default, filtered by author, title search, tag, status and a
 * creation date range. `published` is all anyone sees, except that an author listing their own
 * posts sees every status and may choose one, and so may an admin (see `resolveStatusFilter`).
 */
export const listPosts = async (params: ListPostsParams): Promise<Page<PostSummary>> => {
  const query = parseInput(listPostsQuery, params)
  const { page, perPage, authorId, tag, sort } = query
  const viewer = await getSessionUser()
  const { where, status, trashed } = buildPostWhere(query, viewer)
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
  // Only a published-only list without free text or dates is the same for every viewer, and it is
  // cached only when its key is bounded. Search terms, date ranges and arbitrary author ids are
  // high-cardinality (the one author list in the UI is the viewer's own, which is not cached
  // anyway), a tag that no published post uses (not in `listTags`, itself cached and capped) is
  // free for a caller to invent, and any other status, or the trash, means the viewer's identity
  // chose the result, so those go straight to the database.
  if (query.q || query.from || query.to || authorId || trashed || status !== 'published') {
    return load()
  }
  if (tag && !(await listTags()).some((known) => known.name === tag)) {
    return load()
  }
  return remember(
    // JSON keeps the parts unambiguous: no author or tag value can spell another list's key. The
    // tag passed `tagNameSchema` above, so it is at most `TAG_NAME_MAX_LENGTH` characters.
    JSON.stringify(['posts:list', page, perPage, authorId ?? null, sort, tag ?? null]),
    { ttl: POSTS_CACHE_TTL, tags: [POSTS_TAG], schema: postsPageSchema },
    load,
  )
}

/**
 * The viewer-independent part of a post, cached for everyone, whatever its status or whether it is
 * in the trash. Private to this file: `getPost` applies `postPolicy` before any of it reaches a
 * viewer. `id` may come straight from a route param; one that is not a valid id is simply not
 * found.
 */
const getPostBase = async (id: number | string): Promise<PostDetailBase> => {
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
 * admin) is reported as not found, the same answer as a missing post. A post in the trash is only
 * readable by whoever may restore it. This is for reads only; a write on someone else's post
 * follows exists (404) → allowed (403), so a stranger who tries to change a draft gets 403.
 */
export const getPost = async (id: number | string): Promise<PostDetail> => {
  // Cached for everyone; the visibility check and `permissions` follow per viewer, never cached.
  const [post, viewer] = await Promise.all([getPostBase(id), getSessionUser()])
  const record = { status: post.status, authorId: post.author.id, deletedAt: post.deletedAt }
  if (!(post.deletedAt ? postPolicy.restore(viewer, record) : postPolicy.view(viewer, record))) {
    throw new NotFoundError('Post not found')
  }
  return withPermissions(post, viewer)
}

/** Tags used by published, live posts, with how many; the same for every viewer, so it is cached. */
export const listTags = async (): Promise<TagSummary[]> => {
  const published = {
    post: { status: 'published', deletedAt: null },
  } satisfies Prisma.PostTagWhereInput
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
 * are dropped. Runs inside the caller's transaction so a post is never left half-tagged. Safe under
 * concurrency: `createMany` with `skipDuplicates` is one `INSERT ... ON CONFLICT DO NOTHING`, so two
 * transactions adding the same new tag cannot fail on the unique `name` (an upsert is a select then
 * an insert and can). The ids are read back afterwards, whoever inserted the rows. Names are
 * inserted in sorted order so two transactions that share new tags wait on each other in the same
 * order and cannot deadlock.
 */
const replacePostTags = async (tx: Prisma.TransactionClient, postId: number, names: string[]) => {
  let tagIds: number[] = []
  if (names.length > 0) {
    await tx.tag.createMany({
      data: [...names].sort().map((name) => ({ name })),
      skipDuplicates: true,
    })
    const tags = await tx.tag.findMany({ where: { name: { in: names } }, select: { id: true } })
    tagIds = tags.map((tag) => tag.id)
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
  await consumeRateLimit(`create-post:user:${viewer.id}`, { max: 20, windowMs: 60_000 })
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

/**
 * The post exists and the viewer may do `action` to it, in that order, so a stranger gets 403 (not
 * 404) for an existing post, draft or not. A post in the trash does not exist for every action but
 * `restore`, and `restore` finds nothing to restore on a live post: both answer 404.
 */
const requirePostChange = async (
  viewer: SessionUser,
  id: number,
  action: 'update' | 'delete' | 'changeStatus' | 'restore',
) => {
  // Every change drops the cached lists and may add tags, so one account cannot hammer it.
  await consumeRateLimit(`write-post:user:${viewer.id}`, { max: 60, windowMs: 60_000 })
  const post = await db.post.findUnique({
    where: { id },
    select: { userId: true, status: true, publishedAt: true, deletedAt: true },
  })
  if (!post || (post.deletedAt !== null) !== (action === 'restore')) {
    throw new NotFoundError('Post not found')
  }
  authorize(
    postPolicy[action],
    viewer,
    { status: post.status, authorId: post.userId, deletedAt: post.deletedAt },
    'You cannot change this post',
  )
  return post
}

export const updatePost = async (
  id: number | string,
  input: UpdatePostInput,
): Promise<PostDetail> => {
  const viewer = await requireUser()
  const postId = parseInput(idSchema, id)
  const { tags, ...data } = parseInput(updatePostInput, input)
  await requirePostChange(viewer, postId, 'update')
  const row = await db
    .$transaction(async (tx) => {
      // Prisma skips `@updatedAt` for an empty `data`, so it is set here: a tags-only edit is an edit.
      await tx.post.update({
        where: { id: postId, deletedAt: null },
        data: { ...data, updatedAt: new Date() },
      })
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
  const current = await requirePostChange(viewer, postId, 'changeStatus')
  if (!canTransitionPostStatus(current.status, next)) {
    throw new ValidationError({
      status: [`A ${current.status} post cannot become ${next}`],
    })
  }
  const moved = await db.post.updateMany({
    where: { id: postId, status: current.status, deletedAt: null },
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

/**
 * Moves a post to the trash: signed in (401) → exists and live (404) → the author or an admin
 * (403). The row stays, with `deletedAt` set, until `purgeDeletedPosts` removes it; `restorePost`
 * brings it back.
 */
export const deletePost = async (id: number | string): Promise<void> => {
  const viewer = await requireUser()
  const postId = parseInput(idSchema, id)
  await requirePostChange(viewer, postId, 'delete')
  // Conditional on the checked state, so a concurrent trash or restore cannot be overwritten.
  const trashed = await db.post.updateMany({
    where: { id: postId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  if (trashed.count === 0) {
    throw new NotFoundError('Post not found')
  }
  await invalidateTags(POSTS_TAG, postTag(postId))
}

/**
 * Takes a post out of the trash: signed in (401) → exists and in the trash (404) → the author or
 * an admin (403). The only write that acts on a trashed post.
 */
export const restorePost = async (id: number | string): Promise<PostDetail> => {
  const viewer = await requireUser()
  const postId = parseInput(idSchema, id)
  await requirePostChange(viewer, postId, 'restore')
  const restored = await db.post.updateMany({
    where: { id: postId, deletedAt: { not: null } },
    data: { deletedAt: null },
  })
  if (restored.count === 0) {
    throw new NotFoundError('Post not found')
  }
  await invalidateTags(POSTS_TAG, postTag(postId))
  const row = await db.post
    .findUniqueOrThrow({ where: { id: postId }, select: postDetailSelect })
    .catch(mapMissingRecord)
  return withPermissions(toPostBase(row), viewer)
}
