import { getInitials } from '@/lib/utils'
import type { UserResponse } from '@/services/UsersService'

export class UserPresenter {
  id!: number
  name!: string
  username!: string
  phone!: string | null
  website!: string | null
  created_at!: string
  updated_at!: string

  // Frontend properties
  initials!: string
  website_url!: string | null

  constructor(data: UserResponse) {
    Object.assign(this, data)

    this.initials = getInitials(this.name?.trim() || this.username || '')
    this.website_url = this.website
      ? /^https?:\/\//.test(this.website)
        ? this.website
        : `https://${this.website}`
      : null
  }
}
