import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRealtime } from '@/hooks/useRealtime'
import type { RealtimeEvent } from '@/lib/dto/notifications'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  static CLOSED = 2
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  readyState = 0
  closed = false
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this)
  }
  close() {
    this.closed = true
    this.readyState = FakeEventSource.CLOSED
  }
  fail(readyState: number) {
    this.readyState = readyState
    this.onerror?.()
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

  describe('after a failed connection', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('reopens a closed stream after a backoff that doubles up to 30 seconds and resets on open', () => {
      render(<Probe onEvent={vi.fn()} />)
      const delays = [1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]
      for (const [index, delay] of delays.entries()) {
        const source = FakeEventSource.instances[index]
        act(() => source.fail(FakeEventSource.CLOSED))
        expect(source.closed).toBe(true)
        act(() => vi.advanceTimersByTime(delay - 1))
        expect(FakeEventSource.instances).toHaveLength(index + 1)
        act(() => vi.advanceTimersByTime(1))
        expect(FakeEventSource.instances).toHaveLength(index + 2)
      }

      const last = FakeEventSource.instances[delays.length]
      act(() => last.onopen?.())
      act(() => last.fail(FakeEventSource.CLOSED))
      act(() => vi.advanceTimersByTime(1000))
      expect(FakeEventSource.instances).toHaveLength(delays.length + 2)
    })

    it('leaves a stream the browser is retrying on its own alone', () => {
      render(<Probe onEvent={vi.fn()} />)
      act(() => FakeEventSource.instances[0].fail(0))
      act(() => vi.advanceTimersByTime(60_000))
      expect(FakeEventSource.instances).toHaveLength(1)
    })

    it('clears the pending reconnect on unmount', () => {
      const { unmount } = render(<Probe onEvent={vi.fn()} />)
      act(() => FakeEventSource.instances[0].fail(FakeEventSource.CLOSED))
      unmount()
      act(() => vi.advanceTimersByTime(60_000))
      expect(FakeEventSource.instances).toHaveLength(1)
    })
  })
})
