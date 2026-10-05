import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { toPage, type Page } from '@/lib/dto/common'
import {
  POST_EXCERPT_LENGTH,
  type CreatePostInput,
  type ListPostsQuery,
  type PostDetail,
  type PostSummary,
  type UpdatePostInput,
} from '@/lib/dto/posts'
import { getSessionUser, requireUser, type SessionUser } from './auth'
import { db } from './db'
import { ForbiddenError, NotFoundError } from './errors'
import { userProfileSelect } from './users'

const postSummarySelect = {
  id: true,
  title: true,
  body: true,
  createdAt: true,
  user: { select: userProfileSelect },
} satisfies Prisma.PostSelect

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

export function toExcerpt(body: string, maxLength = POST_EXCERPT_LENGTH) {
  return body.length <= maxLength ? body : `${body.slice(0, maxLength).trimEnd()}…`
}

/** Record-level rule: the author or an admin may change a post. */
function canModify(viewer: SessionUser | null, authorId: string) {
  return viewer !== null && (viewer.id === authorId || viewer.role === 'admin')
}

function toPostSummary(row: PostSummaryRow): PostSummary {
  return {
    id: row.id,
    title: row.title,
    excerpt: toExcerpt(row.body),
    createdAt: row.createdAt,
    author: row.user,
  }
}

function toPostDetail(row: PostDetailRow, viewer: SessionUser | null): PostDetail {
  const allowed = canModify(viewer, row.userId)
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: row.user,
    permissions: { update: allowed, delete: allowed },
  }
}

export async function listPosts({
  page,
  perPage,
  authorId,
}: ListPostsQuery): Promise<Page<PostSummary>> {
  const where: Prisma.PostWhereInput = authorId ? { userId: authorId } : {}
  const [rows, totalItems] = await Promise.all([
    db.post.findMany({
      where,
      select: postSummarySelect,
      orderBy: { id: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.post.count({ where }),
  ])
  return toPage(rows.map(toPostSummary), totalItems, { page, perPage })
}

export async function getPost(id: number): Promise<PostDetail> {
  const [row, viewer] = await Promise.all([
    db.post.findUnique({ where: { id }, select: postDetailSelect }),
    getSessionUser(),
  ])
  if (!row) {
    throw new NotFoundError('Post not found')
  }
  return toPostDetail(row, viewer)
}

export async function createPost(input: CreatePostInput): Promise<PostDetail> {
  const viewer = await requireUser()
  const row = await db.post.create({
    data: { ...input, userId: viewer.id },
    select: postDetailSelect,
  })
  return toPostDetail(row, viewer)
}

/** Signed in, post exists, and the viewer may change it — in that order. */
async function requirePostChange(id: number) {
  const viewer = await requireUser()
  const post = await db.post.findUnique({ where: { id }, select: { userId: true } })
  if (!post) {
    throw new NotFoundError('Post not found')
  }
  if (!canModify(viewer, post.userId)) {
    throw new ForbiddenError('You cannot change this post')
  }
  return viewer
}

export async function updatePost(id: number, input: UpdatePostInput): Promise<PostDetail> {
  const viewer = await requirePostChange(id)
  const row = await db.post.update({ where: { id }, data: input, select: postDetailSelect })
  return toPostDetail(row, viewer)
}

export async function deletePost(id: number): Promise<void> {
  await requirePostChange(id)
  await db.post.delete({ where: { id } })
}
