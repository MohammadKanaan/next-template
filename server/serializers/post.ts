import 'server-only'
import type { PostDetailedResponse, PostResponse } from '@/services/PostsService'
import { toIsoString, type PostRow, type PostWithUserRow } from '@/server/models'
import { serializeUser } from './user'

export function serializePost(post: PostRow, viewerId: number | null): PostResponse {
  const isOwner = viewerId === post.userId
  return {
    id: post.id,
    created_at: toIsoString(post.createdAt),
    updated_at: toIsoString(post.updatedAt),
    permissions: { update: isOwner, destroy: isOwner },
    title: post.title,
    body: post.body,
    user_id: post.userId,
  }
}

export function serializePostDetailed(
  post: PostWithUserRow,
  viewerId: number | null,
): PostDetailedResponse {
  return { ...serializePost(post, viewerId), user: serializeUser(post.user) }
}
