import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LoginView } from '@/app/(minimal)/login/view'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/actions/auth', () => ({ signInAction: vi.fn(), signInWithGoogleAction: vi.fn() }))

describe('LoginView', () => {
  it('offers Google sign-in only when the provider is configured', () => {
    const { rerender } = render(<LoginView nextPath="/dashboard" googleEnabled={false} />)
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()

    rerender(<LoginView nextPath="/dashboard" googleEnabled />)
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
  })
})
