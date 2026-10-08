'use client'

import { useEffect, useEffectEvent, useRef } from 'react'
import styles from './styles.module.scss'

type InfiniteSentinelProps = {
  /** Called when the sentinel scrolls into view (or is in view when `disabled` turns off). */
  onVisible: () => void
  /** Pause while a page is loading or there is nothing more to load. */
  disabled?: boolean
}

/**
 * An invisible marker placed after a list. It calls `onVisible` when it comes into view, so a list
 * can load its next page as the reader nears the end. The observer is created again whenever
 * `disabled` turns off, which reports a sentinel that is still in view after a short page. Where
 * `IntersectionObserver` is missing it does nothing: pair it with a "Load more" button.
 */
export const InfiniteSentinel = ({ onVisible, disabled = false }: InfiniteSentinelProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const handleVisible = useEffectEvent(onVisible)

  useEffect(() => {
    const element = ref.current
    if (disabled || !element || typeof IntersectionObserver === 'undefined') {
      return
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        handleVisible()
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [disabled])

  return <div ref={ref} className={styles.sentinel} aria-hidden="true" />
}
