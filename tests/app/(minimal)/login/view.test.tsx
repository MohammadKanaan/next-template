import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { signInAction } from '@/actions/auth'
import { LoginView } from '@/app/(minimal)/login/view'

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))
vi.mock('@/actions/auth', () => ({ signInAction: vi.fn(), signInWithGoogleAction: vi.fn() }))

const signIn = async () => {
  vi.mocked(signInAction).mockResolvedValue({ ok: true, data: null })
  await userEvent.type(screen.getByLabelText(/Email/), 'who@example.com')
  await userEvent.type(screen.getByLabelText(/Password/), 'long-enough-1')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('LoginView', () => {
  it('explains a failed provider sign-in with fixed text, only when it failed', () => {
    const { rerender } = render(<LoginView nextPath="/dashboard" googleEnabled />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    rerender(<LoginView nextPath="/dashboard" googleEnabled signInFailed />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sign-in with Google could not be completed. Try again or use your password.',
    )
  })

  it('offers Google sign-in only when the provider is configured', () => {
    const { rerender } = render(<LoginView nextPath="/dashboard" googleEnabled={false} />)
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()

    rerender(<LoginView nextPath="/dashboard" googleEnabled />)
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
  })

  describe('after signing in', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
      vi.clearAllMocks()
    })

    it('navigates the browser to a Route Handler target, which the client router cannot render', async () => {
      const assign = vi.fn()
      vi.stubGlobal('location', { assign })
      const nextPath = '/api/auth/verify-email?token=t'
      render(<LoginView nextPath={nextPath} googleEnabled={false} />)
      await signIn()

      await waitFor(() => expect(assign).toHaveBeenCalledWith(nextPath))
      expect(replace).not.toHaveBeenCalled()
    })

    it('uses the client router for an app page', async () => {
      const assign = vi.fn()
      vi.stubGlobal('location', { assign })
      render(<LoginView nextPath="/posts/mine" googleEnabled={false} />)
      await signIn()

      await waitFor(() => expect(replace).toHaveBeenCalledWith('/posts/mine'))
      expect(assign).not.toHaveBeenCalled()
    })
  })
})
