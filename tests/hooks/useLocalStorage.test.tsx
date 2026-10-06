import { act, render, renderHook, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { useLocalStorage } from '@/hooks/useLocalStorage'

const schema = z.object({ title: z.string(), count: z.number() })
const KEY = 'test:draft'

function Reader() {
  const { value } = useLocalStorage(KEY, schema)
  return <p data-testid="value">{value ? value.title : 'empty'}</p>
}

describe('useLocalStorage', () => {
  beforeEach(() => localStorage.clear())

  it('is null when nothing is stored', () => {
    const { result } = renderHook(() => useLocalStorage(KEY, schema))
    expect(result.current.value).toBeNull()
  })

  it('reads a stored value that matches the schema', () => {
    localStorage.setItem(KEY, JSON.stringify({ title: 'Hi', count: 2 }))
    const { result } = renderHook(() => useLocalStorage(KEY, schema))
    expect(result.current.value).toEqual({ title: 'Hi', count: 2 })
  })

  it('reads malformed JSON and values that fail the schema as null', () => {
    localStorage.setItem(KEY, '{not json')
    const malformed = renderHook(() => useLocalStorage(KEY, schema))
    expect(malformed.result.current.value).toBeNull()

    localStorage.setItem(KEY, JSON.stringify({ title: 1 }))
    const invalid = renderHook(() => useLocalStorage(KEY, schema))
    expect(invalid.result.current.value).toBeNull()
  })

  it('stores through setValue and clears through removeValue', () => {
    const { result } = renderHook(() => useLocalStorage(KEY, schema))
    act(() => result.current.setValue({ title: 'Hi', count: 1 }))
    expect(result.current.value).toEqual({ title: 'Hi', count: 1 })
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({ title: 'Hi', count: 1 })

    act(() => result.current.removeValue())
    expect(result.current.value).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('keeps the same value object until the stored string changes', () => {
    localStorage.setItem(KEY, JSON.stringify({ title: 'Hi', count: 1 }))
    const { result, rerender } = renderHook(() => useLocalStorage(KEY, schema))
    const first = result.current.value
    rerender()
    expect(result.current.value).toBe(first)
    act(() => result.current.setValue({ title: 'Hi', count: 1 }))
    expect(result.current.value).toBe(first)
  })

  it('keeps hook instances for the same key in sync', () => {
    const writer = renderHook(() => useLocalStorage(KEY, schema))
    const reader = renderHook(() => useLocalStorage(KEY, schema))
    act(() => writer.result.current.setValue({ title: 'Shared', count: 1 }))
    expect(reader.result.current.value).toEqual({ title: 'Shared', count: 1 })
  })

  it('follows a change made in another tab', () => {
    const { result } = renderHook(() => useLocalStorage(KEY, schema))
    act(() => {
      localStorage.setItem(KEY, JSON.stringify({ title: 'Elsewhere', count: 3 }))
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, storageArea: localStorage }))
    })
    expect(result.current.value).toEqual({ title: 'Elsewhere', count: 3 })
  })

  it('renders null on the server even when something is stored (no hydration mismatch)', () => {
    localStorage.setItem(KEY, JSON.stringify({ title: 'Stored', count: 1 }))
    expect(renderToString(<Reader />)).toContain('empty')
    render(<Reader />)
    expect(screen.getByTestId('value')).toHaveTextContent('Stored')
  })
})
