import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LoginForm } from '@/components/Auth/LoginForm'

describe('LoginForm', () => {
  it('validates the fields before submitting', async () => {
    const onSubmit = vi.fn()
    render(<LoginForm onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Email/), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the server message on failure', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'Invalid email or password',
    })
    render(<LoginForm onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Email/), 'who@example.com')
    await userEvent.type(screen.getByLabelText(/Password/), 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(onSubmit).toHaveBeenCalledWith({ email: 'who@example.com', password: 'secret' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
  })

  it('links to the forgot-password page', () => {
    render(<LoginForm onSubmit={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    )
  })
})
