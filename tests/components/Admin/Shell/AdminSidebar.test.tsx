import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminSidebar } from '@/components/Admin/Shell/AdminSidebar'
import { SidebarProvider } from '@/components/SCN/sidebar'
import type { CurrentUser } from '@/lib/dto/users'

const navigation = vi.hoisted(() => ({ pathname: '/admin' }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }))
// jsdom has no `matchMedia`; the sidebar renders its desktop form.
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))
vi.mock('@/components/Auth/SignOutButton', () => ({
  SignOutButton: () => <button>Log out</button>,
}))

const admin: CurrentUser = {
  id: 'u1',
  name: 'Ada Lovelace',
  username: 'ada',
  email: 'ada@example.com',
  emailVerified: true,
  image: null,
  website: null,
  role: 'admin',
}

const renderSidebar = () =>
  render(
    <SidebarProvider>
      <AdminSidebar viewer={admin} />
    </SidebarProvider>,
  )

describe('AdminSidebar', () => {
  beforeEach(() => {
    navigation.pathname = '/admin'
  })

  it('marks the most specific section of the current path as current', () => {
    navigation.pathname = '/admin/users/0190d1a2-0000-7000-8000-00000000c0de'
    renderSidebar()
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current')
  })

  it('marks the overview as current on the dashboard root only', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Users' })).not.toHaveAttribute('aria-current')
  })
})
