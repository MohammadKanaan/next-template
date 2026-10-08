import { commentsPageSchema, type Comment } from '@/lib/dto/comments'
import type { CursorPage, CursorQuery } from '@/lib/dto/common'
import { getJson } from './getJson'

/** Client facade for `GET /api/v1/posts/[id]/comments`; returns the same `CursorPage<Comment>` as the DAL. */
export const fetchComments = async (
  postId: number,
  query: Partial<CursorQuery>,
  signal?: AbortSignal,
): Promise<CursorPage<Comment>> => {
  return getJson(`/posts/${postId}/comments`, query, commentsPageSchema, signal)
}
