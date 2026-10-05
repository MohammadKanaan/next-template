import type { Permissions } from '@/types/api'
import type { PostModel } from '@/types/models'
import API, { type Listing } from './api'
import type { UserResponse } from './UsersService'

export type PostResponse = PostModel & {
  permissions: Permissions
}

export type PostDetailedResponse = PostResponse & {
  user: UserResponse
}

export type PostListParams = Partial<{
  page: number
  perPage: number
  userId: number
}>

export type CreatePostAttributes = Pick<PostModel, 'title' | 'body'>

export type PostAttributes = Partial<CreatePostAttributes>

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
