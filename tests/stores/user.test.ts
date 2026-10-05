import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuthService from '@/services/AuthService'
import MeService from '@/services/MeService'
import { UserPresenter } from '@/presenters/User/UserPresenter'
import { useUserStore } from '@/stores/user'

const me = {
  user: {
    id: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    name: 'Leanne Graham',
    username: 'leanne',
    email: 'leanne@example.com',
    phone: null,
    website: null,
  },
}

describe('user store', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useUserStore.setState({
      profile: null,
      user: null,
      isUserLoading: false,
      hasLoadedProfile: false,
    })
  })

  it('loads the profile into a presenter', async () => {
    vi.spyOn(MeService, 'getProfile').mockResolvedValue({
      success: true,
      status: 200,
      message: 'ok',
      data: me,
    })
    await useUserStore.getState().fetchProfile()
    const state = useUserStore.getState()
    expect(state.user).toBeInstanceOf(UserPresenter)
    expect(state.profile?.user.email).toBe('leanne@example.com')
    expect(state.hasLoadedProfile).toBe(true)
    expect(state.isUserLoading).toBe(false)
  })

  it('clears the user on a 401 without toasting or throwing', async () => {
    vi.spyOn(MeService, 'getProfile').mockResolvedValue({
      success: false,
      status: 401,
      message: 'Sign in to continue',
      data: null,
    })
    const response = await useUserStore.getState().fetchProfile()
    expect(response.success).toBe(false)
    expect(useUserStore.getState().user).toBeNull()
  })

  it('treats an expired session as signed out on logout', async () => {
    useUserStore.getState().setProfile(me)
    vi.spyOn(AuthService, 'revokeSession').mockResolvedValue({
      success: false,
      status: 401,
      message: 'Sign in to continue',
      data: null,
    })
    const response = await useUserStore.getState().logout()
    expect(response.success).toBe(true)
    expect(useUserStore.getState().user).toBeNull()
  })
})
