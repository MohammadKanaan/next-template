import { UserPresenter } from '@/presenters/User/UserPresenter'
import type { PostDetailedResponse, PostResponse } from '@/services/PostsService'
import type { Permissions } from '@/types/api'

export class PostPresenter {
  id!: number
  title!: string
  body!: string
  user_id!: number
  permissions!: Permissions
  created_at!: string
  updated_at!: string

  user?: UserPresenter

  // Frontend properties
  display_title!: string

  constructor(data: PostResponse | PostDetailedResponse) {
    Object.assign(this, data)

    if ('user' in data && data.user) {
      this.user = new UserPresenter(data.user)
    }

    this.display_title = this.title?.trim() || 'Untitled'
  }
}
