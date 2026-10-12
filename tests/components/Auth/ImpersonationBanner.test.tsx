import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stopImpersonatingAction } from '@/actions/admin'
import { ImpersonationBanner } from '@/components/Auth/ImpersonationBanner'

vi.mock('@/actions/admin', () => ({ stopImpersonatingAction: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('ImpersonationBanner', () => {
  /** Stopping changes who the browser is, so the banner does a full navigation. */
  const assign = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('location', { assign })
    assign.mockReset()
    vi.mocked(stopImpersonatingAction).mockReset()
    vi.mocked(toast.error).mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stops impersonating and goes back to the admin page', async () => {
    vi.mocked(stopImpersonatingAction).mockResolvedValue({ ok: true, data: null })
    render(<ImpersonationBanner name="Grace Hopper" />)
    await userEvent.click(screen.getByRole('button', { name: 'Stop impersonating' }))
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/admin'))
    expect(stopImpersonatingAction).toHaveBeenCalledTimes(1)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows the failure and stays where it is', async () => {
    vi.mocked(stopImpersonatingAction).mockResolvedValue({
      ok: false,
      code: 'FORBIDDEN',
      message: 'You are not impersonating anyone',
    })
    render(<ImpersonationBanner name="Grace Hopper" />)
    await userEvent.click(screen.getByRole('button', { name: 'Stop impersonating' }))
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('You are not impersonating anyone'),
    )
    expect(assign).not.toHaveBeenCalled()
  })
})
