import { create } from 'zustand'
import { sFetch } from '@/lib/apiCall'
import { UserPresenter } from '@/presenters/User/UserPresenter'
import AuthService, { type SessionResponse } from '@/services/AuthService'
import MeService, { type MeResponse } from '@/services/MeService'
import type { ApiResponse } from '@/types/api'

type UserState = {
  profile: MeResponse | null
  user: UserPresenter | null
  isUserLoading: boolean
  hasLoadedProfile: boolean
  setProfile: (profile: MeResponse | null) => void
  fetchProfile: () => Promise<ApiResponse<MeResponse>>
  createSession: (email: string) => Promise<ApiResponse<SessionResponse>>
  logout: () => Promise<ApiResponse<null>>
}

export const useUserStore = create<UserState>()((set, get) => {
  const quiet = {
    loading: (value: boolean) => set({ isUserLoading: value }),
    toast: false,
    throwOnError: false,
  }

  return {
    profile: null,
    user: null,
    isUserLoading: false,
    hasLoadedProfile: false,

    setProfile: (profile) =>
      set({ profile, user: profile ? new UserPresenter(profile.user) : null }),

    fetchProfile: async () => {
      const response = await sFetch(() => MeService.getProfile(), quiet)
      get().setProfile(response.success ? response.data : null)
      set({ hasLoadedProfile: true })
      return response
    },

    createSession: async (email) => {
      const response = await sFetch(() => AuthService.createSession(email), quiet)
      if (response.success && response.data) {
        get().setProfile({ user: response.data.user })
        set({ hasLoadedProfile: true })
      }
      return response
    },

    logout: async () => {
      const response = await sFetch(() => AuthService.revokeSession(), quiet)
      if (response.success || response.status === 401) {
        get().setProfile(null)
        return { ...response, success: true }
      }
      return response
    },
  }
})
