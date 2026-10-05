import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ResetPasswordForm } from '@/components/Auth/ResetPasswordForm'

describe('ResetPasswordForm', () => {
  it('validates the password length before submitting', async () => {
    const onSubmit = vi.fn()
    render(<ResetPasswordForm token="tok" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/New password/), 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the token from the link together with the new password', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: null })
    render(<ResetPasswordForm token="tok-123" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/New password/), 'long-enough-1')
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    expect(onSubmit).toHaveBeenCalledWith({ token: 'tok-123', password: 'long-enough-1' })
  })

  it('shows an expired-link failure as a form-level alert', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      message: 'This reset link is invalid or has expired. Request a new one.',
    })
    render(<ResetPasswordForm token="tok" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/New password/), 'long-enough-1')
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired')
  })

  it('puts a server password error next to the field', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      message: 'Validation failed',
      fieldErrors: { password: ['Choose a stronger password'] },
    })
    render(<ResetPasswordForm token="tok" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/New password/), 'long-enough-1')
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    expect(await screen.findByText('Choose a stronger password')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
