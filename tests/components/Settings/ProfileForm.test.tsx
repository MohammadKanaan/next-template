import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProfileForm } from '@/components/Settings/ProfileForm'
import { hydrateProfileForm } from '@/components/Settings/ProfileForm/utils'
import type { CurrentUser } from '@/lib/dto/users'

const user: CurrentUser = {
  id: 'u1',
  name: 'Ada Lovelace',
  username: 'ada_l',
  email: 'ada@example.com',
  emailVerified: true,
  image: null,
  website: 'example.com',
  role: 'user',
}

describe('ProfileForm', () => {
  it('starts from the user and keeps Save disabled until something changes', async () => {
    render(<ProfileForm user={user} onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(/Name/)).toHaveValue('Ada Lovelace')
    expect(screen.getByLabelText(/Username/)).toHaveValue('ada_l')
    expect(screen.getByLabelText(/Website/)).toHaveValue('example.com')
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/Name/), '!')
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled()
  })

  it('shows an empty website for a user without one', () => {
    render(<ProfileForm user={{ ...user, website: null }} onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(/Website/)).toHaveValue('')
  })

  it('validates before submitting', async () => {
    const onSubmit = vi.fn()
    render(<ProfileForm user={user} onSubmit={onSubmit} />)
    await userEvent.clear(screen.getByLabelText(/Name/))
    await userEvent.clear(screen.getByLabelText(/Username/))
    await userEvent.type(screen.getByLabelText(/Username/), 'No Spaces!')
    await userEvent.clear(screen.getByLabelText(/Website/))
    await userEvent.type(screen.getByLabelText(/Website/), 'javascript:alert(1)')
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    expect(screen.getByText('Use lowercase letters, numbers, and underscores')).toBeInTheDocument()
    expect(screen.getByText('Enter a website like example.com')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the trimmed values', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: null })
    render(<ProfileForm user={user} onSubmit={onSubmit} />)
    await userEvent.clear(screen.getByLabelText(/Name/))
    await userEvent.type(screen.getByLabelText(/Name/), '  Ada King  ')
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Ada King',
      username: 'ada_l',
      website: 'example.com',
    })
  })

  it('puts a taken username on its field', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      message: 'Validation failed',
      fieldErrors: { username: ['That username is taken'] },
    })
    render(<ProfileForm user={user} onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Username/), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByText('That username is taken')).toBeInTheDocument()
    expect(screen.getByLabelText(/Username/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows a form-level failure as an alert', async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ ok: false, code: 'RATE_LIMITED', message: 'Too many attempts.' })
    render(<ProfileForm user={user} onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Name/), '!')
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts.')
  })

  it('follows a refreshed user after a save', () => {
    const { rerender } = render(<ProfileForm user={user} onSubmit={vi.fn()} />)
    rerender(<ProfileForm user={{ ...user, name: 'Saved Name' }} onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(/Name/)).toHaveValue('Saved Name')
  })
})

describe('hydrateProfileForm', () => {
  it('maps the user to the form values, with an empty string for no website', () => {
    expect(hydrateProfileForm(user)).toEqual({
      name: 'Ada Lovelace',
      username: 'ada_l',
      website: 'example.com',
    })
    expect(hydrateProfileForm({ ...user, website: null }).website).toBe('')
  })
})
