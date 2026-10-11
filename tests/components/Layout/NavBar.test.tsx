import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NavBar } from '@/components/Layout/NavBar'
import type { CurrentUser } from '@/lib/dto/users'

vi.mock('next/navigation', () => ({ usePathname: () => '/posts' }))
vi.mock('@/components/Auth/SignOutButton', () => ({
  SignOutButton: () => <button>Log out</button>,
}))
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => null }))

const user: CurrentUser = {
  id: 'u1',
  name: 'Ada Lovelace',
  username: 'ada',
  email: 'ada@example.com',
  emailVerified: true,
  image: null,
  website: null,
  role: 'user',
}

/** The desktop and the mobile menu both render the links. */
const linksNamed = (name: string) => screen.queryAllByRole('link', { name, hidden: true })

describe('NavBar', () => {
  it('shows the Admin link to admins, in both menus', () => {
    render(<NavBar user={{ ...user, role: 'admin' }} />)
    const links = linksNamed('Admin')
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/admin')
    }
  })

  it('hides the Admin link from regular users and signed-out visitors', () => {
    const { rerender } = render(<NavBar user={user} />)
    expect(linksNamed('Admin')).toHaveLength(0)
    rerender(<NavBar user={null} />)
    expect(linksNamed('Admin')).toHaveLength(0)
  })

  it('keeps the regular links for everyone', () => {
    const { rerender } = render(<NavBar user={user} />)
    expect(linksNamed('Posts').length).toBeGreaterThan(0)
    expect(linksNamed('UI Kit').length).toBeGreaterThan(0)
    rerender(<NavBar user={null} />)
    expect(linksNamed('Posts').length).toBeGreaterThan(0)
  })

  it('links signed-in users to their own posts, in both menus', () => {
    const { rerender } = render(<NavBar user={user} />)
    const links = linksNamed('My posts')
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/posts/mine')
    }
    rerender(<NavBar user={null} />)
    expect(linksNamed('My posts')).toHaveLength(0)
  })

  it('has no Dashboard link and no notification bell for anyone', () => {
    const { rerender } = render(<NavBar user={{ ...user, role: 'admin' }} />)
    expect(linksNamed('Dashboard')).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: /Notifications/, hidden: true })).toHaveLength(0)
    expect(screen.queryAllByRole('link', { name: /Notifications/, hidden: true })).toHaveLength(0)
    rerender(<NavBar user={user} />)
    expect(linksNamed('Dashboard')).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: /Notifications/, hidden: true })).toHaveLength(0)
  })

  it('offers account settings and sign-out to a signed-in user, and log in otherwise', () => {
    const { rerender } = render(<NavBar user={user} />)
    for (const link of linksNamed('Account settings')) {
      expect(link).toHaveAttribute('href', '/settings')
    }
    expect(linksNamed('Account settings')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Log out', hidden: true })).toHaveLength(2)
    expect(linksNamed('Log in')).toHaveLength(0)

    rerender(<NavBar user={null} />)
    expect(linksNamed('Account settings')).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: 'Log out', hidden: true })).toHaveLength(0)
    for (const link of linksNamed('Log in')) {
      expect(link).toHaveAttribute('href', '/login')
    }
    expect(linksNamed('Log in')).toHaveLength(2)
  })
})
