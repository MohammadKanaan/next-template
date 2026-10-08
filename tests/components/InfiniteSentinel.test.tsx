import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InfiniteSentinel } from '@/components/InfiniteSentinel'

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  observed: Element[] = []
  disconnected = false
  constructor(readonly callback: (entries: { isIntersecting: boolean }[]) => void) {
    FakeIntersectionObserver.instances.push(this)
  }
  observe(element: Element) {
    this.observed.push(element)
  }
  disconnect() {
    this.disconnected = true
  }
  report(isIntersecting: boolean) {
    this.callback([{ isIntersecting }])
  }
}

describe('InfiniteSentinel', () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('calls onVisible when it scrolls into view, not when it leaves', () => {
    const onVisible = vi.fn()
    render(<InfiniteSentinel onVisible={onVisible} />)
    const [observer] = FakeIntersectionObserver.instances
    expect(observer.observed).toHaveLength(1)
    observer.report(false)
    expect(onVisible).not.toHaveBeenCalled()
    observer.report(true)
    expect(onVisible).toHaveBeenCalledTimes(1)
  })

  it('calls the latest handler without observing again', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<InfiniteSentinel onVisible={first} />)
    rerender(<InfiniteSentinel onVisible={second} />)
    expect(FakeIntersectionObserver.instances).toHaveLength(1)
    FakeIntersectionObserver.instances[0].report(true)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('stops observing while disabled and observes again when enabled', () => {
    const { rerender } = render(<InfiniteSentinel onVisible={vi.fn()} />)
    rerender(<InfiniteSentinel onVisible={vi.fn()} disabled />)
    expect(FakeIntersectionObserver.instances[0].disconnected).toBe(true)
    rerender(<InfiniteSentinel onVisible={vi.fn()} />)
    expect(FakeIntersectionObserver.instances).toHaveLength(2)
    expect(FakeIntersectionObserver.instances[1].disconnected).toBe(false)
  })

  it('does nothing where IntersectionObserver is missing', () => {
    vi.unstubAllGlobals()
    expect(() => render(<InfiniteSentinel onVisible={vi.fn()} />)).not.toThrow()
  })

  it('disconnects on unmount', () => {
    const { unmount } = render(<InfiniteSentinel onVisible={vi.fn()} />)
    unmount()
    expect(FakeIntersectionObserver.instances[0].disconnected).toBe(true)
  })
})
