import 'server-only'
import type { CurrentUserResponse } from '@/services/MeService'
import type { UserResponse } from '@/services/UsersService'
import { toIsoString, type UserRow } from '@/server/models'

export function serializeUser(user: UserRow): UserResponse {
  return {
    id: user.id,
    created_at: toIsoString(user.createdAt),
    updated_at: toIsoString(user.updatedAt),
    name: user.name,
    username: user.username,
    phone: user.phone,
    website: user.website,
  }
}

export function serializeCurrentUser(user: UserRow): CurrentUserResponse {
  return { ...serializeUser(user), email: user.email }
}
