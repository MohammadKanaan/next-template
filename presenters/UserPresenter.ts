import type { UserResponse } from '@/services/UsersService'

function toAbsoluteUrl(value: string | null) {
  if (!value) {
    return null
  }
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

/** Users store bare domains (`hildegard.org`); views need a linkable URL. */
export const presentUser = <T extends UserResponse>(user: T): T => ({
  ...user,
  website: toAbsoluteUrl(user.website),
})
