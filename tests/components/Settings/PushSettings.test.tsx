import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PushSettings } from '@/components/Settings/PushSettings'

// Valid base64url (a real VAPID key is 87 characters).
const PUBLIC_KEY = 'BOrD_test_ke'

const fakeSubscription = {
  endpoint: 'https://push.example/a',
  toJSON: () => ({ endpoint: 'https://push.example/a', keys: { p256dh: 'p', auth: 'a' } }),
  unsubscribe: vi.fn(async () => true),
}

const pushManager = {
  getSubscription: vi.fn(async (): Promise<typeof fakeSubscription | null> => null),
  subscribe: vi.fn(async () => fakeSubscription),
}

const registration = { pushManager }

const installFakes = () => {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register: vi.fn(async () => registration), ready: Promise.resolve(registration) },
  })
  vi.stubGlobal('PushManager', class {})
}

const setup = () => {
  const onSubscribe = vi.fn().mockResolvedValue({ ok: true, data: null })
  const onUnsubscribe = vi.fn().mockResolvedValue({ ok: true, data: null })
  render(
    <PushSettings publicKey={PUBLIC_KEY} onSubscribe={onSubscribe} onUnsubscribe={onUnsubscribe} />,
  )
  return { onSubscribe, onUnsubscribe }
}

describe('PushSettings', () => {
  beforeEach(() => {
    installFakes()
    pushManager.getSubscription.mockResolvedValue(null)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('says so when the browser cannot do push', () => {
    vi.unstubAllGlobals()
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined })
    render(<PushSettings publicKey={PUBLIC_KEY} onSubscribe={vi.fn()} onUnsubscribe={vi.fn()} />)
    expect(screen.getByText(/not supported/i)).toBeInTheDocument()
  })

  it('registers the service worker, subscribes and stores the subscription', async () => {
    const { onSubscribe } = setup()
    const enable = await screen.findByRole('button', { name: 'Enable browser notifications' })
    await userEvent.click(enable)
    await waitFor(() =>
      expect(onSubscribe).toHaveBeenCalledWith({
        endpoint: 'https://push.example/a',
        keys: { p256dh: 'p', auth: 'a' },
      }),
    )
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js')
    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array),
      }),
    )
    expect(
      await screen.findByRole('button', { name: 'Disable browser notifications' }),
    ).toBeInTheDocument()
  })

  it('shows the disable button when already subscribed and unsubscribes', async () => {
    pushManager.getSubscription.mockResolvedValue(fakeSubscription)
    const { onUnsubscribe } = setup()
    const disable = await screen.findByRole('button', { name: 'Disable browser notifications' })
    await userEvent.click(disable)
    await waitFor(() => expect(onUnsubscribe).toHaveBeenCalledWith('https://push.example/a'))
    expect(fakeSubscription.unsubscribe).toHaveBeenCalled()
    expect(
      await screen.findByRole('button', { name: 'Enable browser notifications' }),
    ).toBeInTheDocument()
  })

  it('shows an action failure', async () => {
    const { onSubscribe } = setup()
    onSubscribe.mockResolvedValue({ ok: false, code: 'RATE_LIMITED', message: 'Too many attempts' })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Enable browser notifications' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts')
  })
})
