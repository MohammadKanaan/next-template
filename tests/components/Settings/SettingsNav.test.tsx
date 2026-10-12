import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AtSign, KeyRound, UserRound } from 'lucide-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsNav, type SettingsNavItem } from '@/components/Settings/SettingsNav'

const items: SettingsNavItem[] = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'email', label: 'Email', icon: AtSign },
  { id: 'delete', label: 'Delete account', icon: KeyRound, danger: true },
]

// Where each section's top sits in the viewport; the spy reads it on every scroll.
const tops: Record<string, number> = {}

const renderNav = () =>
  render(
    <>
      <SettingsNav items={items} />
      {items.map((item) => (
        <section key={item.id} id={item.id} />
      ))}
    </>,
  )

const scrollTo = (positions: Record<string, number>) => {
  Object.assign(tops, positions)
  fireEvent.scroll(window)
}

const current = () =>
  screen.getAllByRole('link').find((link) => link.getAttribute('aria-current') === 'location')
    ?.textContent

beforeEach(() => {
  Object.assign(tops, { profile: 100, email: 600, delete: 1200 })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return { top: tops[this.id] ?? 0 } as DOMRect
  })
  // jsdom lays nothing out, so the page would always count as scrolled to the bottom.
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(5000)
  Element.prototype.scrollIntoView = vi.fn()
  // jsdom has no `matchMedia`; the nav asks it whether to scroll smoothly.
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('SettingsNav', () => {
  it('links each item to its section and starts on the first', () => {
    renderNav()
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '#profile',
      '#email',
      '#delete',
    ])
    expect(current()).toBe('Profile')
  })

  it('marks the last section whose top has scrolled past the NavBar', () => {
    renderNav()
    scrollTo({ profile: -500, email: 40, delete: 700 })
    expect(current()).toBe('Email')
  })

  it('scrolls to a clicked section and marks it at once', async () => {
    renderNav()
    await userEvent.click(screen.getByRole('link', { name: 'Delete account' }))
    expect(current()).toBe('Delete account')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' })
    expect(window.location.hash).toBe('#delete')
  })

  it('keeps the clicked section while the page scrolls past the others, then follows scrolling again', () => {
    vi.useFakeTimers()
    renderNav()
    fireEvent.click(screen.getByRole('link', { name: 'Delete account' }))

    // The smooth scroll passes Email on its way down: the indicator must not stop there.
    scrollTo({ profile: -300, email: 80, delete: 600 })
    expect(current()).toBe('Delete account')

    // Once the scroll has settled, the spy takes over again.
    act(() => vi.advanceTimersByTime(200))
    scrollTo({ profile: -300, email: 80, delete: 600 })
    expect(current()).toBe('Email')
  })
})
