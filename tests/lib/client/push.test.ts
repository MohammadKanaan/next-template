import { afterEach, describe, expect, it, vi } from 'vitest'
import { unsubscribeBrowserPush } from '@/lib/client/push'

const setServiceWorker = (value: unknown) =>
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value })

describe('unsubscribeBrowserPush', () => {
  afterEach(() => setServiceWorker(undefined))

  it('returns null when the browser has no service worker support', async () => {
    setServiceWorker(undefined)
    expect(await unsubscribeBrowserPush()).toBeNull()
  })

  it('returns null when there is no registration or no subscription', async () => {
    setServiceWorker({ getRegistration: vi.fn(async () => undefined) })
    expect(await unsubscribeBrowserPush()).toBeNull()
    setServiceWorker({
      getRegistration: vi.fn(async () => ({ pushManager: { getSubscription: async () => null } })),
    })
    expect(await unsubscribeBrowserPush()).toBeNull()
  })

  it('unsubscribes the browser and returns the endpoint it had', async () => {
    const unsubscribe = vi.fn(async () => true)
    setServiceWorker({
      getRegistration: async () => ({
        pushManager: {
          getSubscription: async () => ({ endpoint: 'https://push.example/a', unsubscribe }),
        },
      }),
    })
    expect(await unsubscribeBrowserPush()).toBe('https://push.example/a')
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('swallows every failure', async () => {
    setServiceWorker({
      getRegistration: async () => {
        throw new Error('blocked')
      },
    })
    expect(await unsubscribeBrowserPush()).toBeNull()
  })
})
