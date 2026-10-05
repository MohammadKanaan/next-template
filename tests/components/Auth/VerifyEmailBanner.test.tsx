import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'
import { resendVerificationAction } from '@/actions/auth'
import { VerifyEmailBanner } from '@/components/Auth/VerifyEmailBanner'

vi.mock('@/actions/auth', () => ({ resendVerificationAction: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('VerifyEmailBanner', () => {
  it('tells the user which address to confirm', () => {
    render(<VerifyEmailBanner email="ada@example.com" />)
    expect(screen.getByRole('status')).toHaveTextContent('ada@example.com')
  })

  it('resends the email and confirms with a toast', async () => {
    vi.mocked(resendVerificationAction).mockResolvedValue({ ok: true, data: null })
    render(<VerifyEmailBanner email="ada@example.com" />)
    await userEvent.click(screen.getByRole('button', { name: 'Resend' }))
    expect(resendVerificationAction).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Verification email sent')
  })

  it('shows the failure message when resending fails', async () => {
    vi.mocked(resendVerificationAction).mockResolvedValue({
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Try again in a minute.',
    })
    render(<VerifyEmailBanner email="ada@example.com" />)
    await userEvent.click(screen.getByRole('button', { name: 'Resend' }))
    expect(toast.error).toHaveBeenCalledWith('Too many attempts. Try again in a minute.')
  })
})
