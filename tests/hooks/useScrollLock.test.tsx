import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useScrollLock } from '@/hooks/useScrollLock'

describe('useScrollLock', () => {
  it('locks while any owner holds the lock and unlocks on unmount', () => {
    const first = renderHook(() => useScrollLock())
    const second = renderHook(() => useScrollLock())
    act(() => {
      first.result.current.lockScroll()
      second.result.current.lockScroll()
    })
    expect(document.body).toHaveClass('is-scroll-locked')
    act(() => first.result.current.unlockScroll())
    expect(document.body).toHaveClass('is-scroll-locked')
    second.unmount()
    expect(document.body).not.toHaveClass('is-scroll-locked')
    expect(document.documentElement).not.toHaveClass('is-scroll-locked')
  })
})
