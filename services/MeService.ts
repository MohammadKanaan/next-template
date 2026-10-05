import API from './api'
import type { UserResponse } from './UsersService'

export interface CurrentUserResponse extends UserResponse {
  email: string
}

export interface MeResponse {
  user: CurrentUserResponse
}

class MeService extends API {
  public static getProfile() {
    return this.get<MeResponse>('/me')
  }
}

export default MeService
