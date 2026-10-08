import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NavBar } from '@/components/Layout/NavBar'
import type { CurrentUser } from '@/lib/dto/users'

vi.mock('next/navigation', () => ({ usePathname: () => '/posts' }))
vi.mock('@/components/Auth/SignOutButton', () => ({
  SignOutButton: () => <button>Log out</button>,
}))
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => null }))
vi.mock('@/components/Notifications/Bell', () => ({
  NotificationBell: ({ initialUnreadCount }: { initialUnreadCount: number }) => (
    <button>Notifications {initialUnreadCount}</button>
  ),
}))

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
const adminLinks = () => screen.queryAllByRole('link', { name: 'Admin', hidden: true })

describe('NavBar', () => {
  it('shows the Admin link to admins, in both menus', () => {
    render(<NavBar user={{ ...user, role: 'admin' }} unreadCount={0} />)
    const links = adminLinks()
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/admin')
    }
  })

  it('hides the Admin link from regular users and signed-out visitors', () => {
    const { rerender } = render(<NavBar user={user} unreadCount={0} />)
    expect(adminLinks()).toHaveLength(0)
    rerender(<NavBar user={null} unreadCount={0} />)
    expect(adminLinks()).toHaveLength(0)
  })

  it('keeps the regular links for everyone', () => {
    render(<NavBar user={user} unreadCount={0} />)
    expect(screen.getAllByRole('link', { name: 'Posts', hidden: true }).length).toBeGreaterThan(0)
  })

  it('links signed-in users to their own posts, in both menus', () => {
    const { rerender } = render(<NavBar user={user} unreadCount={0} />)
    const links = screen.getAllByRole('link', { name: 'My posts', hidden: true })
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/posts/mine')
    }
    rerender(<NavBar user={null} unreadCount={0} />)
    expect(screen.queryAllByRole('link', { name: 'My posts', hidden: true })).toHaveLength(0)
  })

  it('shows the bell to signed-in users only, in both menus', () => {
    const { rerender } = render(<NavBar user={user} unreadCount={2} />)
    expect(screen.getAllByRole('button', { name: 'Notifications 2', hidden: true })).toHaveLength(2)
    rerender(<NavBar user={null} unreadCount={0} />)
    expect(screen.queryAllByRole('button', { name: /Notifications/, hidden: true })).toHaveLength(0)
  })
})
