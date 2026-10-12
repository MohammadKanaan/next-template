'use client'

import { useSyncExternalStore } from 'react'
import { ROUTE_HOME, safeRedirectPath } from '@/lib/constants-routes'

const STORAGE_KEY = 'return-path'
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Storage can be unavailable (blocked, full); the visitor then simply lands on the default.
const read = () => {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

const write = (value: string | null) => {
  try {
    if (value === null) {
      window.sessionStorage.removeItem(STORAGE_KEY)
    } else {
      window.sessionStorage.setItem(STORAGE_KEY, value)
    }
  } catch {
    return
  }
  listeners.forEach((listener) => listener())
}

const getServerSnapshot = () => null

/**
 * Takes a visitor back to the page they left to log in or sign up. `remember()` (the link to the
 * login page) stores the current page in `sessionStorage`; the login and signup views call
 * `resolve(nextPath)` for where to go on success and `clear()` once they have gone. The value
 * outlives the hop between login and signup but not the tab.
 *
 * An explicit target always wins: `next` reaches the views already run through `safeRedirectPath`,
 * which collapses a missing one to `ROUTE_HOME`, so only that value is replaced.
 */
export const useReturnPath = () => {
  const stored = useSyncExternalStore(subscribe, read, getServerSnapshot)

  const remember = () => {
    const { pathname, search, hash } = window.location
    write(`${pathname}${search}${hash}`)
  }

  const resolve = (nextPath: string) =>
    nextPath === ROUTE_HOME && stored ? safeRedirectPath(stored, nextPath) : nextPath

  const clear = () => write(null)

  return { remember, resolve, clear }
}
