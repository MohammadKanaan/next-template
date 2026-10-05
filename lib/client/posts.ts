import { z } from 'zod'
import { pageSchema, type Page } from '@/lib/dto/common'
import { postSummarySchema, type ListPostsQuery, type PostSummary } from '@/lib/dto/posts'
import { env } from '@/lib/env'

const postsPageSchema = pageSchema(postSummarySchema)
const errorMessageSchema = z.object({ message: z.string() })

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'RequestError'
  }
}

/**
 * Client facade for `GET /api/v1/posts`. Parses with the shared schema, so the caller gets the
 * same `Page<PostSummary>` (with `Date`s) that Server Components get from the DAL.
 */
export async function fetchPosts(
  query: ListPostsQuery,
  signal?: AbortSignal,
): Promise<Page<PostSummary>> {
  const params = new URLSearchParams({ page: String(query.page), perPage: String(query.perPage) })
  if (query.authorId) {
    params.set('authorId', query.authorId)
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
