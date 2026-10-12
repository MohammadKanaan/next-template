'use client'

import type { LucideIcon } from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from 'react'
import styles from './styles.module.scss'

/** How far below the viewport top a section's heading must pass to become the active one. */
const SPY_OFFSET = 160

/** How long the page must stop scrolling before a clicked link hands control back to the spy. */
const JUMP_SETTLE_MS = 150

/** Starts (or extends) the hold that keeps the spy off while a clicked link scrolls the page. */
const holdForJump = (timerRef: RefObject<number | null>) => {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current)
  }
  timerRef.current = window.setTimeout(() => {
    timerRef.current = null
  }, JUMP_SETTLE_MS)
}

export type SettingsNavItem = {
  /** The id of the section element the link scrolls to. */
  id: string
  label: string
  icon: LucideIcon
  danger?: boolean
}

export type SettingsNavProps = {
  items: SettingsNavItem[]
}

/**
 * The settings page's section links. Sticky beside the sections (a strip under the NavBar on small
 * screens); one indicator slides to the section in view.
 */
export const SettingsNav = ({ items }: SettingsNavProps) => {
  const [active, setActive] = useState<string | undefined>(items[0]?.id)
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>())
  const indicatorRef = useRef<HTMLSpanElement>(null)
  // Set while a clicked link scrolls the page, so the spy does not walk the indicator through every
  // section the scroll passes; cleared once scrolling has been quiet for a moment.
  const jumpTimerRef = useRef<number | null>(null)

  // Scroll-spy: the last section whose top has passed the offset is active. At the bottom of the
  // page the last section wins, since it may be too short to ever reach the offset.
  useEffect(() => {
    const update = () => {
      if (jumpTimerRef.current !== null) {
        holdForJump(jumpTimerRef)
        return
      }
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      if (atBottom) {
        setActive(items.at(-1)?.id)
        return
      }
      let current = items[0]?.id
      for (const item of items) {
        const top = document.getElementById(item.id)?.getBoundingClientRect().top
        if (top !== undefined && top <= SPY_OFFSET) {
          current = item.id
        }
      }
      setActive(current)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    // A pending hold only clears the ref, so it may outlive the component.
    return () => window.removeEventListener('scroll', update)
  }, [items])

  useLayoutEffect(() => {
    const link = active ? linkRefs.current.get(active) : undefined
    const indicator = indicatorRef.current
    if (!link || !indicator) {
      return
    }
    indicator.style.transform = `translate(${link.offsetLeft}px, ${link.offsetTop}px)`
    indicator.style.width = `${link.offsetWidth}px`
    indicator.style.height = `${link.offsetHeight}px`
    // The first placement does not slide; later ones do.
    const frame = requestAnimationFrame(() => indicator.setAttribute('data-ready', ''))
    return () => cancelAnimationFrame(frame)
  }, [active])

  const jump = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault()
    setActive(id)
    // Holds the spy even when the section is already in view and no scroll event follows.
    holdForJump(jumpTimerRef)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' })
    window.history.replaceState(null, '', `#${id}`)
  }

  return (
    <nav className={styles.nav} aria-label="Settings sections">
      <span ref={indicatorRef} className={styles.indicator} aria-hidden="true" />
      {items.map(({ id, label, icon: Icon, danger }) => (
        <a
          key={id}
          ref={(element) => {
            if (element) {
              linkRefs.current.set(id, element)
            }
          }}
          href={`#${id}`}
          className={styles.link}
          data-active={id === active || undefined}
          data-danger={danger || undefined}
          aria-current={id === active ? 'location' : undefined}
          onClick={(event) => jump(event, id)}
        >
          <Icon aria-hidden="true" />
          {label}
        </a>
      ))}
    </nav>
  )
}
