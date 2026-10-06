import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { idSchema } from '@/lib/dto/common'
import {
  commentsBaseSchema,
  createCommentInput,
  type Comment,
  type CommentBase,
  type CreateCommentInput,
} from '@/lib/dto/comments'
import { invalidateTags, remember } from '@/lib/server/cache'
import { getSessionUser, requireUser, type SessionUser } from './auth'
import { commentsTag, POSTS_TAG, postTag } from './cacheTags'
import { db } from './db'
import { ForbiddenError, NotFoundError, parseInput } from './errors'
import { canViewPost, getPostBase } from './posts'
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
  const post = await getPostBase(postId)
  const viewer = await getSessionUser()
  if (!canViewPost(viewer, post)) {
    throw new NotFoundError('Post not found')
  }
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
  postId: number,
  input: CreateCommentInput,
): Promise<Comment> => {
  const viewer = await requireUser()
  const id = parseInput(idSchema, postId)
  const { body } = parseInput(createCommentInput, input)
  // Read from the database, not the cache: a post that was just archived must not take comments.
  const post = await db.post.findUnique({ where: { id }, select: { userId: true, status: true } })
  if (!post || !canViewPost(viewer, { status: post.status, author: { id: post.userId } })) {
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

/** Signed in (401) → the comment exists (404) → its author, the post's author or an admin (403). */
export const deleteComment = async (id: number): Promise<void> => {
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
