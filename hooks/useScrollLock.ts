'use client'

import { useCallback, useEffect, useRef } from 'react'

const SCROLL_LOCK_CLASS = 'is-scroll-locked'
const scrollLockOwners = new Set<symbol>()

function syncScrollLockClass() {
  if (typeof document === 'undefined') {
    return
  }

  const method = scrollLockOwners.size > 0 ? 'add' : 'remove'
  document.documentElement.classList[method](SCROLL_LOCK_CLASS)
  document.body.classList[method](SCROLL_LOCK_CLASS)
}

export function useScrollLock() {
  const ownerRef = useRef<symbol>(undefined)

  const lockScroll = useCallback(() => {
    ownerRef.current ??= Symbol('scroll-lock-owner')
    if (scrollLockOwners.has(ownerRef.current)) {
      return
    }

    scrollLockOwners.add(ownerRef.current)
    syncScrollLockClass()
  }, [])

  const unlockScroll = useCallback(() => {
    if (!ownerRef.current || !scrollLockOwners.delete(ownerRef.current)) {
      return
    }

    syncScrollLockClass()
  }, [])

  useEffect(() => unlockScroll, [unlockScroll])

  return { lockScroll, unlockScroll }
}
