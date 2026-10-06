'use client'

import { useEffect, useState } from 'react'

const SCROLL_LOCK_CLASS = 'is-scroll-locked'
const scrollLockOwners = new Set<symbol>()

const syncScrollLockClass = () => {
  if (typeof document === 'undefined') {
    return
  }

  const method = scrollLockOwners.size > 0 ? 'add' : 'remove'
  document.documentElement.classList[method](SCROLL_LOCK_CLASS)
  document.body.classList[method](SCROLL_LOCK_CLASS)
}

const release = (owner: symbol) => {
  if (scrollLockOwners.delete(owner)) {
    syncScrollLockClass()
  }
}

export const useScrollLock = () => {
  // Identifies this component among everything that may hold the lock.
  const [owner] = useState(() => Symbol('scroll-lock-owner'))

  const lockScroll = () => {
    if (scrollLockOwners.has(owner)) {
      return
    }

    scrollLockOwners.add(owner)
    syncScrollLockClass()
  }

  const unlockScroll = () => release(owner)

  // Never leave the page locked behind a component that is gone.
  useEffect(() => () => release(owner), [owner])

  return { lockScroll, unlockScroll }
}
