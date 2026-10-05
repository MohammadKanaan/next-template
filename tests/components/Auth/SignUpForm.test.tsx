import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SignUpForm } from '@/components/Auth/SignUpForm'

describe('SignUpForm', () => {
  it('validates every field before submitting', async () => {
    const onSubmit = vi.fn()
    render(<SignUpForm onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    expect(screen.getByText('Username must be at least 3 characters')).toBeInTheDocument()
    expect(screen.getByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows a server field error next to its field', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      message: 'Validation failed',
      fieldErrors: { username: ['That username is taken'] },
    })
    render(<SignUpForm onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Name/), 'Ada')
    await userEvent.type(screen.getByLabelText(/Username/), 'ada')
    await userEvent.type(screen.getByLabelText(/Email/), 'ada@example.com')
    await userEvent.type(screen.getByLabelText(/Password/), 'long-enough-1')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Ada',
      username: 'ada',
      email: 'ada@example.com',
      password: 'long-enough-1',
    })
    expect(await screen.findByText('That username is taken')).toBeInTheDocument()
  })
})
