import type { UserModel } from '@/types/models'
import API from './api'

/** The signed-in user sees their own full record, including `email`. */
export type CurrentUserResponse = UserModel

export type MeResponse = {
  user: CurrentUserResponse
}

class MeService extends API {
  public static getProfile() {
    return this.get<MeResponse>('/me')
  }
}

export default MeService
