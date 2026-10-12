import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { revokeUserSessionsAction, setUserRoleAction } from '@/actions/admin'
import { UserActions } from '@/components/Admin/Users/UserActions'
import type { AdminUser } from '@/lib/dto/users'

vi.mock('@/actions/admin', () => ({
  banUserAction: vi.fn(),
  impersonateUserAction: vi.fn(),
  setUserRoleAction: vi.fn(),
  unbanUserAction: vi.fn(),
  revokeUserSessionsAction: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const GRACE_ID = '0190d1a2-0000-7000-8000-00000000c0de'

const grace: AdminUser = {
  id: GRACE_ID,
  name: 'Grace Hopper',
  username: 'grace',
  email: 'grace@example.com',
  emailVerified: true,
  role: 'user',
  banned: false,
  banReason: null,
  createdAt: new Date('2026-10-05T15:04:00.000Z'),
}

describe('UserActions', () => {
  beforeEach(() => {
    vi.mocked(revokeUserSessionsAction).mockReset()
    vi.mocked(setUserRoleAction).mockReset()
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('offers to sign the user out everywhere only in the extended form, and confirms', async () => {
    vi.mocked(revokeUserSessionsAction).mockResolvedValue({ ok: true, data: null })
    const { rerender } = render(<UserActions user={grace} isSelf={false} />)
    expect(screen.queryByRole('button', { name: 'Sign out everywhere' })).not.toBeInTheDocument()

    rerender(<UserActions user={grace} isSelf={false} extended />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }))
    expect(revokeUserSessionsAction).toHaveBeenCalledWith(GRACE_ID)
    expect(toast.success).toHaveBeenCalledWith('Grace Hopper was signed out everywhere')
  })

  it('never offers to sign another admin out (the DAL refuses it)', () => {
    render(<UserActions user={{ ...grace, role: 'admin' }} isSelf={false} extended />)
    expect(screen.queryByRole('button', { name: 'Sign out everywhere' })).not.toBeInTheDocument()
  })

  it('shows the server’s message when signing out everywhere fails', async () => {
    vi.mocked(revokeUserSessionsAction).mockResolvedValue({
      ok: false,
      code: 'NOT_FOUND',
      message: 'User not found',
    })
    render(<UserActions user={grace} isSelf={false} extended />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }))
    expect(toast.error).toHaveBeenCalledWith('User not found')
  })

  it('reports when it is busy so a parent can hold the other controls', async () => {
    let finish: (value: { ok: true; data: null }) => void = () => {}
    vi.mocked(revokeUserSessionsAction).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const onBusy = vi.fn()
    render(<UserActions user={grace} isSelf={false} extended onBusy={onBusy} />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }))
    expect(onBusy).toHaveBeenLastCalledWith(true)
    finish({ ok: true, data: null })
    await vi.waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(false))
  })
})
