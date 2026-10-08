import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useInfiniteList, type FetchPage } from '@/hooks/useInfiniteList'
import type { CursorPage } from '@/lib/dto/common'

type Item = { id: number }

const initial: CursorPage<Item> = { items: [{ id: 1 }, { id: 2 }], nextCursor: 'c2' }

/** A request the test settles by hand. */
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useInfiniteList', () => {
  it('starts from the initial page', () => {
    const { result } = renderHook(() => useInfiniteList<Item>(vi.fn(), { initial }))
    expect(result.current.items).toEqual(initial.items)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('appends the page after the current cursor and stops at the last one', async () => {
    const fetchPage = vi
      .fn<FetchPage<Item>>()
      .mockResolvedValueOnce({ items: [{ id: 3 }], nextCursor: 'c3' })
      .mockResolvedValueOnce({ items: [{ id: 4 }], nextCursor: null })
    const { result } = renderHook(() => useInfiniteList(fetchPage, { initial }))

    await act(() => result.current.loadMore())
    expect(fetchPage).toHaveBeenLastCalledWith('c2', expect.any(AbortSignal))
    expect(result.current.items.map((item) => item.id)).toEqual([1, 2, 3])
    expect(result.current.hasMore).toBe(true)

    await act(() => result.current.loadMore())
    expect(fetchPage).toHaveBeenLastCalledWith('c3', expect.any(AbortSignal))
    expect(result.current.items.map((item) => item.id)).toEqual([1, 2, 3, 4])
    expect(result.current.hasMore).toBe(false)

    await act(() => result.current.loadMore())
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('keeps one request in flight and reports loading meanwhile', async () => {
    const request = deferred<CursorPage<Item>>()
    const fetchPage = vi.fn<FetchPage<Item>>().mockReturnValue(request.promise)
    const { result } = renderHook(() => useInfiniteList(fetchPage, { initial }))

    let first!: Promise<void>
    act(() => {
      first = result.current.loadMore()
    })
    expect(result.current.isLoading).toBe(true)
    await act(() => result.current.loadMore())
    expect(fetchPage).toHaveBeenCalledTimes(1)

    await act(async () => {
      request.resolve({ items: [{ id: 3 }], nextCursor: null })
      await first
    })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.items).toHaveLength(3)
  })

  it('keeps the items on a failure, reports it, and retries on the next call', async () => {
    const fetchPage = vi
      .fn<FetchPage<Item>>()
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce({ items: [{ id: 3 }], nextCursor: null })
    const { result } = renderHook(() => useInfiniteList(fetchPage, { initial }))

    await act(() => result.current.loadMore())
    expect(result.current.error).toBe('Network down')
    expect(result.current.items).toEqual(initial.items)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.isLoading).toBe(false)

    await act(() => result.current.loadMore())
    expect(result.current.error).toBeNull()
    expect(result.current.items.map((item) => item.id)).toEqual([1, 2, 3])
  })

  it('aborts the request in flight on unmount and ignores its result', async () => {
    const request = deferred<CursorPage<Item>>()
    let signal: AbortSignal | undefined
    const fetchPage: FetchPage<Item> = (_cursor, requestSignal) => {
      signal = requestSignal
      return request.promise
    }
    const { result, unmount } = renderHook(() => useInfiniteList(fetchPage, { initial }))
    let pending!: Promise<void>
    act(() => {
      pending = result.current.loadMore()
    })
    expect(signal?.aborted).toBe(false)
    unmount()
    expect(signal?.aborted).toBe(true)
    request.resolve({ items: [{ id: 3 }], nextCursor: null })
    await pending
    expect(result.current.items).toEqual(initial.items)
  })

  it('reset aborts the request in flight and returns to the initial page', async () => {
    const request = deferred<CursorPage<Item>>()
    let signal: AbortSignal | undefined
    const fetchPage = vi
      .fn<FetchPage<Item>>()
      .mockResolvedValueOnce({ items: [{ id: 3 }], nextCursor: 'c3' })
      .mockImplementationOnce((_cursor, requestSignal) => {
        signal = requestSignal
        return request.promise
      })
    const { result } = renderHook(() => useInfiniteList(fetchPage, { initial }))
    await act(() => result.current.loadMore())
    expect(result.current.items).toHaveLength(3)

    let pending!: Promise<void>
    act(() => {
      pending = result.current.loadMore()
    })
    act(() => result.current.reset())
    expect(signal?.aborted).toBe(true)
    expect(result.current.items).toEqual(initial.items)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.isLoading).toBe(false)

    request.resolve({ items: [{ id: 4 }], nextCursor: null })
    await act(() => pending)
    expect(result.current.items).toEqual(initial.items)

    // The list is usable again after a reset.
    fetchPage.mockResolvedValueOnce({ items: [{ id: 9 }], nextCursor: null })
    await act(() => result.current.loadMore())
    expect(fetchPage).toHaveBeenLastCalledWith('c2', expect.any(AbortSignal))
    expect(result.current.items.map((item) => item.id)).toEqual([1, 2, 9])
  })

  it('renders from a component too', async () => {
    const fetchPage = vi
      .fn<FetchPage<Item>>()
      .mockResolvedValue({ items: [{ id: 3 }], nextCursor: null })
    const List = () => {
      const list = useInfiniteList(fetchPage, { initial })
      return (
        <button type="button" onClick={list.loadMore}>
          {list.items.length}
        </button>
      )
    }
    render(<List />)
    act(() => screen.getByRole('button').click())
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('3'))
  })
})
