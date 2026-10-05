import 'server-only'
import type { PostDetailedResponse, PostResponse } from '@/services/PostsService'
import { toIsoString, type PostRow, type PostWithUserRow } from '@/server/models'
import { serializeUser } from './user'

export function serializePost(post: PostRow, viewerId: number | null): PostResponse {
  const isOwner = viewerId === post.userId
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    userId: post.userId,
    createdAt: toIsoString(post.createdAt),
    updatedAt: toIsoString(post.updatedAt),
    permissions: { update: isOwner, destroy: isOwner },
  }
}

export function serializePostDetailed(
  post: PostWithUserRow,
  viewerId: number | null,
): PostDetailedResponse {
  return { ...serializePost(post, viewerId), user: serializeUser(post.user) }
}
