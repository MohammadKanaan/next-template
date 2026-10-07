import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { idSchema } from '@/lib/dto/common'
import {
  commentsBaseSchema,
  createCommentInput,
  type CreateCommentInput,
  type Comment,
  type CommentBase,
} from '@/lib/dto/comments'
import { invalidateTags, remember } from '@/lib/server/cache'
import { getSessionUser, requireUser, type SessionUser } from './auth'
import { commentsTag, POSTS_TAG, postTag } from './cacheTags'
import { db } from './db'
import { ForbiddenError, NotFoundError, parseInput } from './errors'
import { canViewPost, getPost } from './posts'
import { consumeRateLimit } from './rateLimit'
import { userProfileSelect } from './users'

const COMMENTS_CACHE_TTL = 300
/** A post's comments are listed oldest first, up to this many. */
const COMMENTS_LIMIT = 200

const commentSelect = {
  id: true,
  body: true,
  createdAt: true,
  user: { select: userProfileSelect },
} satisfies Prisma.CommentSelect

type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>

const toCommentBase = (row: CommentRow): CommentBase => {
  return { id: row.id, body: row.body, createdAt: row.createdAt, author: row.user }
}

/** Record-level rule: a comment goes when its author, the post's author or an admin removes it. */
const canDeleteComment = (viewer: SessionUser | null, authorId: string, postAuthorId: string) => {
  return (
    viewer !== null &&
    (viewer.id === authorId || viewer.id === postAuthorId || viewer.role === 'admin')
  )
}

/** Every comment write changes `commentCount`, which cached lists and details embed. */
const invalidateComments = (postId: number) => {
  return invalidateTags(POSTS_TAG, postTag(postId), commentsTag(postId))
}

/**
 * A post's comments, oldest first, for a viewer who may see the post (otherwise not found, like the
 * post itself). The list is cached for everyone; `permissions.delete` is added per viewer. It is
 * also tagged `POSTS_TAG`, because commenters' names are embedded and a profile edit or a deleted
 * account drops every cached copy.
 */
export const listComments = async (postId: number | string): Promise<Comment[]> => {
  // `getPost` applies the visibility rule (not found for a post the viewer may not see).
  const [post, viewer] = await Promise.all([getPost(postId), getSessionUser()])
  const comments = await remember(
    `comments:${post.id}`,
    {
      ttl: COMMENTS_CACHE_TTL,
      tags: [POSTS_TAG, commentsTag(post.id)],
      schema: commentsBaseSchema,
    },
    async () => {
      const rows = await db.comment.findMany({
        where: { postId: post.id },
        select: commentSelect,
        orderBy: { id: 'asc' },
        take: COMMENTS_LIMIT,
      })
      return rows.map(toCommentBase)
    },
  )
  return comments.map((comment) => ({
    ...comment,
    permissions: { delete: canDeleteComment(viewer, comment.author.id, post.author.id) },
  }))
}

/**
 * Signed in (401) → valid input (422) → the post exists and the viewer may see it (404) → it is
 * published (403: comments are closed on drafts and archived posts).
 */
export const createComment = async (
  postId: number | string,
  input: CreateCommentInput,
): Promise<Comment> => {
  const viewer = await requireUser()
  await consumeRateLimit(`create-comment:user:${viewer.id}`, { max: 20, windowMs: 60_000 })
  const id = parseInput(idSchema, postId)
  const { body } = parseInput(createCommentInput, input)
  // Read from the database, not the cache: a post that was just archived must not take comments.
  const post = await db.post.findUnique({ where: { id }, select: { userId: true, status: true } })
  if (!post || !canViewPost(viewer, post.status, post.userId)) {
    throw new NotFoundError('Post not found')
  }
  if (post.status !== 'published') {
    throw new ForbiddenError('Comments are only open on published posts')
  }
  const row = await db.comment
    .create({ data: { body, postId: id, userId: viewer.id }, select: commentSelect })
    .catch((error: unknown) => {
      // The post vanished between the check and the write (foreign key violation).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new NotFoundError('Post not found')
      }
      throw error
    })
  await invalidateComments(id)
  return {
    ...toCommentBase(row),
    permissions: { delete: canDeleteComment(viewer, viewer.id, post.userId) },
  }
}

/**
 * Signed in (401) → the comment exists (404) → its author, the post's author or an admin (403). A
 * stranger gets 403, not 404, for a comment on a draft: writes do not hide existence.
 */
export const deleteComment = async (id: number | string): Promise<void> => {
  const viewer = await requireUser()
  const commentId = parseInput(idSchema, id)
  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: { postId: true, userId: true, post: { select: { userId: true } } },
  })
  if (!comment) {
    throw new NotFoundError('Comment not found')
  }
  if (!canDeleteComment(viewer, comment.userId, comment.post.userId)) {
    throw new ForbiddenError('You cannot delete this comment')
  }
  await db.comment.delete({ where: { id: commentId } }).catch((error: unknown) => {
    // Deleted by someone else between the check and the write.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new NotFoundError('Comment not found')
    }
    throw error
  })
  await invalidateComments(comment.postId)
}
