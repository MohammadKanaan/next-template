import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SignUpView } from '@/app/(minimal)/signup/view'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/actions/auth', () => ({ signUpAction: vi.fn(), signInWithGoogleAction: vi.fn() }))

describe('SignUpView', () => {
  it('offers Google sign-in only when the provider is configured', () => {
    const { rerender } = render(<SignUpView nextPath="/posts" googleEnabled={false} />)
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument()

    rerender(<SignUpView nextPath="/posts" googleEnabled />)
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
  })
})
