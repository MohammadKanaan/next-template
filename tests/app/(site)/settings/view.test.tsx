import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsView } from '@/app/(site)/settings/view'
import type { CurrentUser, SessionSummary } from '@/lib/dto/users'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/actions/auth', () => ({
  changeEmailAction: vi.fn(),
  changePasswordAction: vi.fn(),
  deleteAccountAction: vi.fn(),
  revokeOtherSessionsAction: vi.fn(),
  revokeSessionAction: vi.fn(),
}))
vi.mock('@/actions/push', () => ({
  subscribePushAction: vi.fn(),
  unsubscribePushAction: vi.fn(),
}))
vi.mock('@/actions/uploads', () => ({
  attachAvatarAction: vi.fn(),
  createAvatarUploadAction: vi.fn(),
}))
vi.mock('@/actions/users', () => ({ updateProfileAction: vi.fn() }))

const user: CurrentUser = {
  id: 'u-ada',
  name: 'Ada Lovelace',
  username: 'ada',
  email: 'ada@example.com',
  emailVerified: true,
  image: null,
  website: null,
  role: 'user',
}
const sessions: SessionSummary[] = []

describe('SettingsView password cards', () => {
  it('shows the password form and the delete dialog for an account with a password', () => {
    render(<SettingsView user={user} sessions={sessions} hasPassword pushConfig={null} />)
    expect(screen.getByLabelText(/Current password/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument()
    expect(screen.queryByText(/signed in with Google/)).not.toBeInTheDocument()
  })

  it('explains how to set a password for an account without one, without the forms', () => {
    render(<SettingsView user={user} sessions={sessions} hasPassword={false} pushConfig={null} />)
    expect(screen.queryByLabelText(/Current password/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument()
    expect(screen.getByText(/signed in with Google/)).toBeInTheDocument()
    for (const link of screen.getAllByRole('link', { name: 'Forgot password' })) {
      expect(link).toHaveAttribute('href', '/forgot-password')
    }
    expect(screen.getAllByRole('link', { name: 'Forgot password' })).toHaveLength(2)
  })

  it('shows the browser notifications card only when push is configured', () => {
    const { rerender } = render(
      <SettingsView user={user} sessions={sessions} hasPassword pushConfig={null} />,
    )
    expect(screen.queryByText('Browser notifications')).not.toBeInTheDocument()
    rerender(
      <SettingsView
        user={user}
        sessions={sessions}
        hasPassword
        pushConfig={{ publicKey: 'key' }}
      />,
    )
    expect(screen.getByText('Browser notifications')).toBeInTheDocument()
  })
})
