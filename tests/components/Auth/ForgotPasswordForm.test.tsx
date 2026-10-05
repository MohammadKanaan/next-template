import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ForgotPasswordForm } from '@/components/Auth/ForgotPasswordForm'

describe('ForgotPasswordForm', () => {
  it('validates the email before submitting', async () => {
    const onSubmit = vi.fn()
    render(<ForgotPasswordForm onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Email/), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the normalised email', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: null })
    render(<ForgotPasswordForm onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Email/), ' Ada@Example.com ')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(onSubmit).toHaveBeenCalledWith({ email: 'ada@example.com' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the server message on failure', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Try again in a minute.',
    })
    render(<ForgotPasswordForm onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Email/), 'ada@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts')
  })

  it('links back to login', () => {
    render(<ForgotPasswordForm onSubmit={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  })
})
