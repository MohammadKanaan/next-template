import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRealtime } from '@/hooks/useRealtime'
import type { RealtimeEvent } from '@/lib/dto/notifications'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  closed = false
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this)
  }
  close() {
    this.closed = true
  }
  emit(data: string) {
    this.onmessage?.(new MessageEvent('message', { data }))
  }
}

const Probe = ({ onEvent }: { onEvent: (event: RealtimeEvent) => void }) => {
  useRealtime(onEvent)
  return null
}

describe('useRealtime', () => {
  beforeEach(() => {
    FakeEventSource.instances = []
    vi.stubGlobal('EventSource', FakeEventSource)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('opens one stream, hands valid events to the latest handler, and closes on unmount', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender, unmount } = render(<Probe onEvent={first} />)
    expect(FakeEventSource.instances).toHaveLength(1)
    const source = FakeEventSource.instances[0]
    expect(source.url).toBe('/api/v1/events')

    act(() => source.emit(JSON.stringify({ type: 'unread', count: 3 })))
    expect(first).toHaveBeenCalledWith({ type: 'unread', count: 3 })

    rerender(<Probe onEvent={second} />)
    expect(FakeEventSource.instances).toHaveLength(1)
    act(() => source.emit(JSON.stringify({ type: 'unread', count: 4 })))
    expect(second).toHaveBeenCalledWith({ type: 'unread', count: 4 })
    expect(first).toHaveBeenCalledTimes(1)

    act(() => source.emit('not json'))
    act(() => source.emit(JSON.stringify({ type: 'nope' })))
    expect(second).toHaveBeenCalledTimes(1)

    unmount()
    expect(source.closed).toBe(true)
  })
})
