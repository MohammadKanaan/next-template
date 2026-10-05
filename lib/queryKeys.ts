import type { PostListParams } from '@/services/PostsService'

export const queryKeys = {
  posts: (params: PostListParams = {}) => ['posts', params] as const,
  post: (id: number) => ['post', id] as const,
}
