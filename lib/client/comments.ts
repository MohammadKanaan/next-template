import { z } from 'zod'
import { commentsPageSchema, type Comment } from '@/lib/dto/comments'
import type { CursorPage, CursorQuery } from '@/lib/dto/common'
import { env } from '@/lib/env'
import { RequestError } from './errors'

const errorMessageSchema = z.object({ message: z.string() })

/** Client facade for `GET /api/v1/posts/[id]/comments`; returns the same `CursorPage<Comment>` as the DAL. */
export const fetchComments = async (
  postId: number,
  query: Partial<CursorQuery>,
  signal?: AbortSignal,
): Promise<CursorPage<Comment>> => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value))
    }
  }
  const response = await fetch(`${env.apiBaseUrl}/posts/${postId}/comments?${params}`, { signal })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const parsed = errorMessageSchema.safeParse(body)
    throw new RequestError(
      parsed.success ? parsed.data.message : `Request failed (${response.status})`,
      response.status,
    )
  }
  return commentsPageSchema.parse(body)
}
