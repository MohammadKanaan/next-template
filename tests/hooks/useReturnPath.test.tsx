import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useReturnPath } from '@/hooks/useReturnPath'

describe('useReturnPath', () => {
  afterEach(() => {
    window.sessionStorage.clear()
    window.history.replaceState(null, '', '/')
  })

  it('remembers the current page and resolves a missing target to it', () => {
    const { result } = renderHook(() => useReturnPath())
    expect(result.current.resolve('/')).toBe('/')

    window.history.replaceState(null, '', '/posts/abc?tab=x#comments')
    act(() => result.current.remember())

    expect(result.current.resolve('/')).toBe('/posts/abc?tab=x#comments')
  })

  it('lets an explicit target win', () => {
    window.sessionStorage.setItem('return-path', '/posts/abc')
    const { result } = renderHook(() => useReturnPath())

    expect(result.current.resolve('/settings')).toBe('/settings')
  })

  it('forgets the page once cleared', () => {
    window.sessionStorage.setItem('return-path', '/posts/abc')
    const { result } = renderHook(() => useReturnPath())
    expect(result.current.resolve('/')).toBe('/posts/abc')

    act(() => result.current.clear())

    expect(result.current.resolve('/')).toBe('/')
    expect(window.sessionStorage.getItem('return-path')).toBeNull()
  })

  it('ignores a stored value that is not a same-origin path', () => {
    window.sessionStorage.setItem('return-path', '//evil.example')
    const { result } = renderHook(() => useReturnPath())

    expect(result.current.resolve('/')).toBe('/')
  })

  it('shares the page between hooks in the same tab', () => {
    const writer = renderHook(() => useReturnPath())
    const reader = renderHook(() => useReturnPath())

    window.history.replaceState(null, '', '/people/ada')
    act(() => writer.result.current.remember())

    expect(reader.result.current.resolve('/')).toBe('/people/ada')
  })
})
