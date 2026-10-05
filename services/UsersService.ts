import type { UserModel } from '@/types/models'
import API from './api'

/** Public profile: every user column except `email`. */
export type UserResponse = Omit<UserModel, 'email'>

class UsersService extends API {
  public static getById(id: number, signal?: AbortSignal) {
    return this.get<UserResponse>(`/users/${id}`, undefined, signal)
  }
}

export default UsersService
