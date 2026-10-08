import type { Page } from '@/lib/dto/common'
import { postsPageSchema, type ListPostsParams, type PostSummary } from '@/lib/dto/posts'
import { getJson } from './getJson'

/**
 * Client facade for `GET /api/v1/posts`. Parses with the shared schema, so the caller gets the
 * same `Page<PostSummary>` (with `Date`s) that Server Components get from the DAL.
 */
export const fetchPosts = async (
  query: ListPostsParams,
  signal?: AbortSignal,
): Promise<Page<PostSummary>> => {
  return getJson('/posts', query, postsPageSchema, signal)
}
