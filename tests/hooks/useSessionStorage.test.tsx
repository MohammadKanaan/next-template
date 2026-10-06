import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { useSessionStorage } from '@/hooks/useSessionStorage'

const schema = z.object({ step: z.number() })
const KEY = 'test:wizard'

describe('useSessionStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('stores in sessionStorage, not localStorage', () => {
    const { result } = renderHook(() => useSessionStorage(KEY, schema))
    expect(result.current.value).toBeNull()
    act(() => result.current.setValue({ step: 2 }))
    expect(result.current.value).toEqual({ step: 2 })
    expect(sessionStorage.getItem(KEY)).toBe('{"step":2}')
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('does not see a value held under the same key in localStorage', () => {
    const local = renderHook(() => useLocalStorage(KEY, schema))
    const session = renderHook(() => useSessionStorage(KEY, schema))
    act(() => local.result.current.setValue({ step: 1 }))
    expect(session.result.current.value).toBeNull()
  })

  it('reads null for an invalid stored value and clears through removeValue', () => {
    sessionStorage.setItem(KEY, '"nope"')
    const { result } = renderHook(() => useSessionStorage(KEY, schema))
    expect(result.current.value).toBeNull()
    act(() => result.current.setValue({ step: 3 }))
    act(() => result.current.removeValue())
    expect(result.current.value).toBeNull()
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })
})
