import { z } from 'zod'
import type { Page } from '@/lib/dto/common'
import { postsPageSchema, type ListPostsParams, type PostSummary } from '@/lib/dto/posts'
import { env } from '@/lib/env'
import { RequestError } from './errors'

const errorMessageSchema = z.object({ message: z.string() })

/**
 * Client facade for `GET /api/v1/posts`. Parses with the shared schema, so the caller gets the
 * same `Page<PostSummary>` (with `Date`s) that Server Components get from the DAL.
 */
export const fetchPosts = async (
  query: ListPostsParams,
  signal?: AbortSignal,
): Promise<Page<PostSummary>> => {
  const params = new URLSearchParams()
  // Every defined key goes out as is, so a new filter needs no change here.
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  }
  const response = await fetch(`${env.apiBaseUrl}/posts?${params}`, { signal })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const parsed = errorMessageSchema.safeParse(body)
    throw new RequestError(
      parsed.success ? parsed.data.message : `Request failed (${response.status})`,
      response.status,
    )
  }
  return postsPageSchema.parse(body)
}
