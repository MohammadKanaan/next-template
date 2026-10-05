import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LoginForm } from '@/components/Auth/LoginForm'

describe('LoginForm', () => {
  it('validates the email before submitting', async () => {
    const onSubmit = vi.fn()
    render(<LoginForm onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Email/), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the server message on failure', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      success: false,
      status: 401,
      message: 'No account found for that email',
      data: null,
    })
    render(<LoginForm onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Email/), 'who@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(onSubmit).toHaveBeenCalledWith({ email: 'who@example.com' })
    expect(await screen.findByRole('alert')).toHaveTextContent('No account found for that email')
  })
})
