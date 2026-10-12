import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { useUrlState } from '@/hooks/useUrlState'

const navigation = vi.hoisted(() => ({
  search: '',
  pathname: '/posts/csr',
  push: vi.fn(),
  replace: vi.fn(),
}))

// Next's router object is stable across renders; the mock must be too.
const router = vi.hoisted(() => ({
  push: (...args: unknown[]) => navigation.push(...args),
  replace: (...args: unknown[]) => navigation.replace(...args),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}))

const schema = z.object({
  page: z.coerce.number().int().positive().catch(1),
  q: z.string().trim().catch(''),
  sort: z.enum(['newest', 'oldest']).catch('newest'),
  compact: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .catch(false),
})

describe('useUrlState', () => {
  beforeEach(() => {
    navigation.search = ''
    navigation.push.mockReset()
    navigation.replace.mockReset()
  })

  it('parses the query string into typed state', () => {
    navigation.search = 'page=3&q=cats&sort=oldest&compact=true'
    const { result } = renderHook(() => useUrlState(schema))
    expect(result.current.state).toEqual({ page: 3, q: 'cats', sort: 'oldest', compact: true })
  })

  it('falls back to the defaults for an empty or garbled URL', () => {
    const empty = renderHook(() => useUrlState(schema))
    expect(empty.result.current.state).toEqual({ page: 1, q: '', sort: 'newest', compact: false })

    navigation.search = 'sort=garbage&page=abc&compact=maybe'
    const garbled = renderHook(() => useUrlState(schema))
    expect(garbled.result.current.state).toEqual({
      page: 1,
      q: '',
      sort: 'newest',
      compact: false,
    })
  })

  it('writes a whole patch in one navigation', () => {
    const { result } = renderHook(() => useUrlState(schema))
    act(() => result.current.setState({ q: 'cats', sort: 'oldest', page: 2 }))
    expect(navigation.replace).toHaveBeenCalledTimes(1)
    expect(navigation.push).not.toHaveBeenCalled()
    const [href, options] = navigation.replace.mock.calls[0]
    expect(href).toBe('/posts/csr?q=cats&sort=oldest&page=2')
    expect(options).toEqual({ scroll: false })
  })

  it('removes keys that are empty or equal to the default', () => {
    navigation.search = 'page=3&q=cats&sort=oldest'
    const { result } = renderHook(() => useUrlState(schema))
    act(() => result.current.setState({ q: '', sort: 'newest' }))
    expect(navigation.replace).toHaveBeenCalledWith('/posts/csr?page=3', { scroll: false })
  })

  it('builds a second patch on the first one while the URL has not committed yet', () => {
    const { result } = renderHook(() => useUrlState(schema))
    act(() => result.current.setState({ q: 'cats' }))
    act(() => result.current.setState({ sort: 'oldest' }))
    expect(navigation.replace).toHaveBeenCalledTimes(2)
    expect(navigation.replace).toHaveBeenNthCalledWith(1, '/posts/csr?q=cats', { scroll: false })
    expect(navigation.replace).toHaveBeenNthCalledWith(2, '/posts/csr?q=cats&sort=oldest', {
      scroll: false,
    })
  })

  it('lets a later patch undo an earlier pending one', () => {
    navigation.search = 'q=cats'
    const { result } = renderHook(() => useUrlState(schema))
    act(() => result.current.setState({ q: '' }))
    act(() => result.current.setState({ page: 2 }))
    expect(navigation.replace).toHaveBeenLastCalledWith('/posts/csr?page=2', { scroll: false })
  })

  it('starts from the committed URL again once it changes', () => {
    const { result, rerender } = renderHook(() => useUrlState(schema))
    act(() => result.current.setState({ q: 'cats' }))
    // The navigation was superseded (say, by back/forward) and the URL is something else now.
    navigation.search = 'sort=oldest'
    rerender()
    act(() => result.current.setState({ page: 2 }))
    expect(navigation.replace).toHaveBeenLastCalledWith('/posts/csr?sort=oldest&page=2', {
      scroll: false,
    })
  })

  it('reads a repeated param the way the server pages do: the last value wins', () => {
    navigation.search = 'q=a&q=b&sort=oldest&sort=garbage'
    const { result } = renderHook(() => useUrlState(schema))
    expect(result.current.state).toMatchObject({ q: 'b', sort: 'newest' })
  })

  it('navigates to the bare path when nothing is left', () => {
    navigation.search = 'page=2'
    const { result } = renderHook(() => useUrlState(schema))
    act(() => result.current.setState({ page: 1 }))
    expect(navigation.replace).toHaveBeenCalledWith('/posts/csr', { scroll: false })
  })

  it('keeps params the schema does not know', () => {
    navigation.search = 'utm=mail&page=2'
    const { result } = renderHook(() => useUrlState(schema))
    act(() => result.current.setState({ q: 'cats' }))
    expect(navigation.replace).toHaveBeenCalledWith('/posts/csr?utm=mail&page=2&q=cats', {
      scroll: false,
    })
  })

  it('writes booleans as strings', () => {
    const { result } = renderHook(() => useUrlState(schema))
    act(() => result.current.setState({ compact: true }))
    expect(navigation.replace).toHaveBeenCalledWith('/posts/csr?compact=true', { scroll: false })
  })

  it('replaces history by default and pushes when asked', () => {
    const replacing = renderHook(() => useUrlState(schema))
    act(() => replacing.result.current.setState({ page: 2 }))
    expect(navigation.replace).toHaveBeenCalledTimes(1)
    expect(navigation.push).not.toHaveBeenCalled()

    navigation.replace.mockReset()
    const pushing = renderHook(() => useUrlState(schema, { history: 'push' }))
    act(() => pushing.result.current.setState({ page: 2 }))
    expect(navigation.push).toHaveBeenCalledWith('/posts/csr?page=2', { scroll: false })
    expect(navigation.replace).not.toHaveBeenCalled()
  })
})
