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
const adminLinks = () => screen.queryAllByRole('link', { name: 'Admin', hidden: true })

describe('NavBar', () => {
  it('shows the Admin link to admins, in both menus', () => {
    render(<NavBar user={{ ...user, role: 'admin' }} />)
    const links = adminLinks()
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/admin')
    }
  })

  it('hides the Admin link from regular users and signed-out visitors', () => {
    const { rerender } = render(<NavBar user={user} />)
    expect(adminLinks()).toHaveLength(0)
    rerender(<NavBar user={null} />)
    expect(adminLinks()).toHaveLength(0)
    rerender(<NavBar user={null} pending />)
    expect(adminLinks()).toHaveLength(0)
  })

  it('keeps the regular links for everyone', () => {
    render(<NavBar user={user} />)
    expect(screen.getAllByRole('link', { name: 'Posts', hidden: true }).length).toBeGreaterThan(0)
  })
})
