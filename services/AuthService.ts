import API from './api'
import type { CurrentUserResponse } from './MeService'

export type SessionResponse = {
  user: CurrentUserResponse
  expiresAt: string
}

class AuthService extends API {
  public static createSession(email: string) {
    return this.post<SessionResponse>('/auth/session', { session: { email } })
  }

  public static getSession() {
    return this.get<SessionResponse>('/auth/session')
  }

  public static revokeSession() {
    return this.delete<null>('/auth/session')
  }
}

export default AuthService
