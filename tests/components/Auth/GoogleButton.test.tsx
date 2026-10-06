import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signInWithGoogleAction } from '@/actions/auth'
import { GoogleButton } from '@/components/Auth/GoogleButton'

vi.mock('@/actions/auth', () => ({ signInWithGoogleAction: vi.fn() }))

describe('GoogleButton', () => {
  beforeEach(() => {
    vi.mocked(signInWithGoogleAction).mockReset()
  })

  it('starts Google sign-in with the return path', async () => {
    vi.mocked(signInWithGoogleAction).mockResolvedValue({ ok: true, data: null })
    render(<GoogleButton nextPath="/posts/mine" />)
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(signInWithGoogleAction).toHaveBeenCalledWith('/posts/mine')
  })

  it('shows the failure message when the action returns instead of redirecting', async () => {
    vi.mocked(signInWithGoogleAction).mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      message: 'Google sign-in is not available.',
    })
    render(<GoogleButton nextPath="/dashboard" />)
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Google sign-in is not available.')
  })
})
