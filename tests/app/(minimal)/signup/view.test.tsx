import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { signUpAction } from '@/actions/auth'
import { SignUpView } from '@/app/(minimal)/signup/view'

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))
vi.mock('@/actions/auth', () => ({ signUpAction: vi.fn(), signInWithGoogleAction: vi.fn() }))

describe('SignUpView', () => {
  afterEach(() => {
    window.sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('offers Google sign-in only when the provider is configured', () => {
    const { rerender } = render(<SignUpView nextPath="/posts" googleEnabled={false} />)
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument()

    rerender(<SignUpView nextPath="/posts" googleEnabled />)
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
  })

  it('returns to the page the visitor left when no target was given', async () => {
    window.sessionStorage.setItem('return-path', '/posts/mine')
    vi.mocked(signUpAction).mockResolvedValue({ ok: true, data: null })
    render(<SignUpView nextPath="/" googleEnabled={false} />)

    await userEvent.type(screen.getByLabelText(/Name/), 'Ada')
    await userEvent.type(screen.getByLabelText(/Username/), 'ada')
    await userEvent.type(screen.getByLabelText(/Email/), 'ada@example.com')
    await userEvent.type(screen.getByLabelText(/Password/), 'long-enough-1')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/posts/mine'))
    expect(window.sessionStorage.getItem('return-path')).toBeNull()
  })
})
