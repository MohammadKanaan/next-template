// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: Record<string, unknown>) => void

const ORIGIN = 'https://app.example'
const source = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8')

const setup = () => {
  const handlers = new Map<string, Handler>()
  const windows: { url: string; focus: ReturnType<typeof vi.fn>; navigate: unknown }[] = []
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    registration: { showNotification: vi.fn(async () => {}) },
    clients: {
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(async () => null),
    },
  }
  new Function('self', source)(self)
  const waited: Promise<unknown>[] = []
  const dispatch = async (type: string, event: Record<string, unknown>) => {
    handlers.get(type)?.({
      ...event,
      waitUntil: (promise: Promise<unknown>) => waited.push(promise),
    })
    await Promise.all(waited.splice(0))
  }
  const addWindow = (url: string) => {
    const client = { url, focus: vi.fn(async () => {}), navigate: vi.fn(async () => {}) }
    windows.push(client)
    return client
  }
  return { self, dispatch, addWindow }
}

describe('public/sw.js', () => {
  let env: ReturnType<typeof setup>
  beforeEach(() => {
    env = setup()
  })

  it('always shows a notification, even when a window of the origin is focused', async () => {
    Object.assign(env.self.clients, {
      matchAll: vi.fn(async () => [{ url: `${ORIGIN}/dashboard`, focused: true }]),
    })
    const payload = { title: 'Casey commented', body: 'Nice', url: '/posts/u/1' }
    await env.dispatch('push', { data: { json: () => payload } })

    expect(env.self.registration.showNotification).toHaveBeenCalledWith('Casey commented', {
      body: 'Nice',
      data: { url: '/posts/u/1' },
    })
  })

  it('shows a generic notification when the payload is not JSON or missing', async () => {
    await env.dispatch('push', {
      data: {
        json: () => {
          throw new SyntaxError('Unexpected token')
        },
      },
    })
    await env.dispatch('push', { data: null })

    expect(env.self.registration.showNotification).toHaveBeenCalledTimes(2)
    for (const call of vi.mocked(env.self.registration.showNotification).mock.calls) {
      expect(call).toEqual(['New notification', { data: {} }])
    }
  })

  it('focuses the window already at the target url instead of navigating another tab', async () => {
    const other = env.addWindow(`${ORIGIN}/posts/new`)
    const target = env.addWindow(`${ORIGIN}/posts/u/1`)
    const close = vi.fn()
    await env.dispatch('notificationclick', {
      notification: { close, data: { url: '/posts/u/1' } },
    })

    expect(close).toHaveBeenCalled()
    expect(target.focus).toHaveBeenCalled()
    expect(other.focus).not.toHaveBeenCalled()
    expect(other.navigate).not.toHaveBeenCalled()
    expect(target.navigate).not.toHaveBeenCalled()
    expect(env.self.clients.openWindow).not.toHaveBeenCalled()
  })

  it('opens a new window when no window is at the target url', async () => {
    const other = env.addWindow(`${ORIGIN}/posts/new`)
    await env.dispatch('notificationclick', {
      notification: { close: vi.fn(), data: { url: '/posts/u/1' } },
    })

    expect(env.self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/posts/u/1`)
    expect(other.focus).not.toHaveBeenCalled()
    expect(other.navigate).not.toHaveBeenCalled()
  })
})
