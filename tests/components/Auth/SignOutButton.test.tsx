import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signOutAction } from '@/actions/auth'
import { SignOutButton } from '@/components/Auth/SignOutButton'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/actions/auth', () => ({ signOutAction: vi.fn() }))

describe('SignOutButton', () => {
  beforeEach(() => {
    vi.mocked(signOutAction).mockResolvedValue({ ok: true, data: null })
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('signs out once, then goes home', async () => {
    render(<SignOutButton />)
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/'))
    expect(signOutAction).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledTimes(1)
  })

  it('does not navigate before the action has finished', async () => {
    let finish: (value: { ok: true; data: null }) => void = () => {}
    vi.mocked(signOutAction).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    render(<SignOutButton />)
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(signOutAction).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeDisabled()

    finish({ ok: true, data: null })
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/'))
    expect(screen.getByRole('button', { name: 'Log out' })).toBeEnabled()
  })
})
