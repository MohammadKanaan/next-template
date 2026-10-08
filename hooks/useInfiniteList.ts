'use client'

import { useEffect, useRef, useState } from 'react'
import type { CursorPage } from '@/lib/dto/common'

/** Fetches the page after `cursor` (`null` is the first page). Must honour `signal`. */
export type FetchPage<T> = (cursor: string | null, signal: AbortSignal) => Promise<CursorPage<T>>

type UseInfiniteListOptions<T> = {
  /** The page the server rendered; the list starts with it and `reset` returns to it. */
  initial: CursorPage<T>
}

/**
 * A list that grows one cursor page at a time. It starts from `initial` (the server-rendered first
 * page), `loadMore` appends the page after the current cursor, and only one request is in flight at
 * a time (a second `loadMore` while loading does nothing). A failed request keeps the items and
 * sets `error`; the next `loadMore` retries it. The request in flight is aborted on unmount and on
 * `reset`, and its result is discarded. `initial` is read once: later changes to it do not touch
 * the list, call `reset` for that.
 */
export const useInfiniteList = <T>(
  fetchPage: FetchPage<T>,
  { initial }: UseInfiniteListOptions<T>,
) => {
  const [items, setItems] = useState(initial.items)
  const [nextCursor, setNextCursor] = useState(initial.nextCursor)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set while a request is in flight; it is what keeps the list to one request at a time.
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      controllerRef.current?.abort()
      controllerRef.current = null
    }
  }, [])

  const loadMore = async () => {
    if (controllerRef.current || nextCursor === null) {
      return
    }
    const controller = new AbortController()
    controllerRef.current = controller
    setIsLoading(true)
    setError(null)
    try {
      const page = await fetchPage(nextCursor, controller.signal)
      if (!controller.signal.aborted) {
        setItems((current) => [...current, ...page.items])
        setNextCursor(page.nextCursor)
      }
    } catch (loadError) {
      if (!controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load more')
      }
    } finally {
      // An aborted request was already replaced or dropped by whoever aborted it.
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setIsLoading(false)
      }
    }
  }

  const reset = () => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setItems(initial.items)
    setNextCursor(initial.nextCursor)
    setIsLoading(false)
    setError(null)
  }

  return { items, loadMore, hasMore: nextCursor !== null, isLoading, error, reset }
}
