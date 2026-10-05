import type { Permissions } from '@/types/api'
import API, { type Listing } from './api'
import type { UserResponse } from './UsersService'

export interface PostResponse {
  id: number
  created_at: string
  updated_at: string
  permissions: Permissions
  title: string
  body: string
  user_id: number
}

export interface PostDetailedResponse extends PostResponse {
  user: UserResponse
}

export type PostListParams = Partial<{
  page: number
  per_page: number
  user_id: number
}>

export type PostAttributes = Partial<{
  title: string
  body: string
}>

export type CreatePostAttributes = PostAttributes & { title: string; body: string }

class PostsService extends API {
  public static list(params?: PostListParams, signal?: AbortSignal) {
    return this.get<Listing<PostResponse>>('/posts', params, signal)
  }

  public static getById(id: number, signal?: AbortSignal) {
    return this.get<PostDetailedResponse>(`/posts/${id}`, undefined, signal)
  }

  public static create(post: CreatePostAttributes) {
    return this.post<PostDetailedResponse>('/posts', { post })
  }

  public static update(id: number, post: PostAttributes) {
    return this.patch<PostDetailedResponse>(`/posts/${id}`, { post })
  }

  public static destroy(id: number) {
    return this.delete<null>(`/posts/${id}`)
  }
}

export default PostsService
