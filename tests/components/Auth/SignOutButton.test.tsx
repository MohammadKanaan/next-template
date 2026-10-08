import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signOutAction } from '@/actions/auth'
import { unsubscribePushAction } from '@/actions/push'
import { SignOutButton } from '@/components/Auth/SignOutButton'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/actions/auth', () => ({ signOutAction: vi.fn() }))
vi.mock('@/actions/push', () => ({ unsubscribePushAction: vi.fn() }))

const unsubscribe = vi.fn(async () => true)

const installSubscription = (subscription: unknown) =>
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: async () => ({ pushManager: { getSubscription: async () => subscription } }),
    },
  })

describe('SignOutButton', () => {
  beforeEach(() => {
    vi.mocked(signOutAction).mockResolvedValue({ ok: true, data: null })
    vi.mocked(unsubscribePushAction).mockResolvedValue({ ok: true, data: null })
  })
  afterEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined })
    vi.clearAllMocks()
  })

  it('signs out and goes home when the browser has no push subscription', async () => {
    render(<SignOutButton />)
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/'))
    expect(signOutAction).toHaveBeenCalledTimes(1)
    expect(unsubscribePushAction).not.toHaveBeenCalled()
  })

  it('drops the browser subscription and its server row before signing out', async () => {
    installSubscription({ endpoint: 'https://push.example/a', unsubscribe })
    const order: string[] = []
    unsubscribe.mockImplementation(async () => {
      order.push('browser')
      return true
    })
    vi.mocked(unsubscribePushAction).mockImplementation(async () => {
      order.push('server row')
      return { ok: true, data: null }
    })
    vi.mocked(signOutAction).mockImplementation(async () => {
      order.push('sign out')
      return { ok: true, data: null }
    })

    render(<SignOutButton />)
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/'))
    expect(unsubscribePushAction).toHaveBeenCalledWith('https://push.example/a')
    expect(order).toEqual(['browser', 'server row', 'sign out'])
  })

  it('still signs out when removing the server row fails', async () => {
    installSubscription({ endpoint: 'https://push.example/a', unsubscribe })
    vi.mocked(unsubscribePushAction).mockRejectedValue(new Error('network'))
    render(<SignOutButton />)
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/'))
    expect(signOutAction).toHaveBeenCalledTimes(1)
  })
})
