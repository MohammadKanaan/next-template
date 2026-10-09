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
vi.mock('@/actions/users', () => ({ updateProfileAction: vi.fn() }))
vi.mock('@/actions/uploads', () => ({ createUploadAction: vi.fn(), attachAvatarAction: vi.fn() }))

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

describe('SettingsView', () => {
  it('shows the profile, email, password, sessions and delete cards', () => {
    render(<SettingsView user={user} sessions={sessions} hasPassword canUpload={false} />)
    for (const title of ['Profile', 'Email', 'Password', 'Sessions', 'Delete account']) {
      expect(screen.getByText(title, { selector: '[data-slot="card-title"]' })).toBeInTheDocument()
    }
    expect(screen.getByText(/Your email is ada@example.com/)).toBeInTheDocument()
    expect(screen.queryByText('Browser notifications')).not.toBeInTheDocument()
    expect(screen.queryByText('Profile photo')).not.toBeInTheDocument()
  })

  it('shows the profile photo card only when storage is configured', () => {
    render(<SettingsView user={user} sessions={sessions} hasPassword canUpload />)
    expect(
      screen.getByText('Profile photo', { selector: '[data-slot="card-title"]' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change photo' })).toBeInTheDocument()
  })

  it('shows the password form and the delete dialog for an account with a password', () => {
    render(<SettingsView user={user} sessions={sessions} hasPassword canUpload={false} />)
    expect(screen.getByLabelText(/Current password/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument()
    expect(screen.queryByText(/signed in with Google/)).not.toBeInTheDocument()
  })

  it('explains how to set a password for an account without one, without the forms', () => {
    render(<SettingsView user={user} sessions={sessions} hasPassword={false} canUpload={false} />)
    expect(screen.queryByLabelText(/Current password/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument()
    expect(screen.getByText(/signed in with Google/)).toBeInTheDocument()
    for (const link of screen.getAllByRole('link', { name: 'Forgot password' })) {
      expect(link).toHaveAttribute('href', '/forgot-password')
    }
    expect(screen.getAllByRole('link', { name: 'Forgot password' })).toHaveLength(2)
  })
})
