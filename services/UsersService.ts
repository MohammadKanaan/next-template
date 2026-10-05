import API from './api'

export interface UserResponse {
  id: number
  created_at: string
  updated_at: string
  name: string
  username: string
  phone: string | null
  website: string | null
}

class UsersService extends API {
  public static getById(id: number, signal?: AbortSignal) {
    return this.get<UserResponse>(`/users/${id}`, undefined, signal)
  }
}

export default UsersService
