import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PasswordForm } from '@/components/Settings/PasswordForm'

const fill = async (current: string, next: string) => {
  if (current) {
    await userEvent.type(screen.getByLabelText(/Current password/), current)
  }
  await userEvent.type(screen.getByLabelText(/New password/), next)
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
}

describe('PasswordForm', () => {
  it('requires the current password and a long enough new one', async () => {
    const onSubmit = vi.fn()
    render(<PasswordForm onSubmit={onSubmit} />)
    await fill('', 'short')
    expect(await screen.findByText('Current password is required')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits both passwords and clears the form on success', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: null })
    render(<PasswordForm onSubmit={onSubmit} />)
    await fill('old-password-1', 'a-new-password-1')
    expect(onSubmit).toHaveBeenCalledWith({
      currentPassword: 'old-password-1',
      newPassword: 'a-new-password-1',
    })
    expect(screen.getByLabelText(/Current password/)).toHaveValue('')
    expect(screen.getByLabelText(/New password/)).toHaveValue('')
  })

  it('puts a wrong current password next to its field and keeps the input', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      message: 'Validation failed',
      fieldErrors: { currentPassword: ['Current password is incorrect'] },
    })
    render(<PasswordForm onSubmit={onSubmit} />)
    await fill('wrong-password', 'a-new-password-1')
    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument()
    expect(screen.getByLabelText(/New password/)).toHaveValue('a-new-password-1')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a form-level failure as an alert', async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ ok: false, code: 'RATE_LIMITED', message: 'Too many attempts.' })
    render(<PasswordForm onSubmit={onSubmit} />)
    await fill('old-password-1', 'a-new-password-1')
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts.')
  })
})
