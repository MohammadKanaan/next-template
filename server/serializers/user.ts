import 'server-only'
import type { CurrentUserResponse } from '@/services/MeService'
import type { UserResponse } from '@/services/UsersService'
import { toIsoString, type UserRow } from '@/server/models'

export function serializeUser(user: UserRow): UserResponse {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    phone: user.phone,
    website: user.website,
    createdAt: toIsoString(user.createdAt),
    updatedAt: toIsoString(user.updatedAt),
  }
}

export function serializeCurrentUser(user: UserRow): CurrentUserResponse {
  return { ...serializeUser(user), email: user.email }
}
