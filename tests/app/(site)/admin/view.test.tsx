import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { setUserRoleAction } from '@/actions/users'
import { AdminView } from '@/app/(site)/admin/view'
import type { Page } from '@/lib/dto/common'
import type { AdminUser } from '@/lib/dto/users'

const navigation = vi.hoisted(() => ({ search: '', replace: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(navigation.search),
}))
vi.mock('@/actions/users', () => ({ setUserRoleAction: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Radix Select measures and captures pointers, which jsdom does not implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

const ada: AdminUser = {
  id: 'u-ada',
  name: 'Ada Lovelace',
  username: 'ada',
  email: 'ada@example.com',
  emailVerified: true,
  role: 'admin',
  createdAt: new Date('2026-10-05T15:04:00.000Z'),
  postCount: 4,
}
const grace: AdminUser = {
  ...ada,
  id: 'u-grace',
  name: 'Grace Hopper',
  username: 'grace',
  email: 'grace@example.com',
  emailVerified: false,
  role: 'user',
  postCount: 0,
}

function page(items: AdminUser[], overrides: Partial<Page<AdminUser>> = {}): Page<AdminUser> {
  return { items, page: 1, perPage: 10, totalItems: items.length, totalPages: 1, ...overrides }
}

describe('AdminView', () => {
  beforeEach(() => {
    navigation.search = ''
    navigation.replace.mockReset()
    vi.mocked(setUserRoleAction).mockReset()
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it('lists users with email, post count and join date, and flags unverified emails', () => {
    render(<AdminView users={page([ada, grace])} viewerId="u-ada" />)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('Ada Lovelace')).toBeInTheDocument()
    expect(within(rows[0]).getByText('@ada')).toBeInTheDocument()
    expect(within(rows[0]).getByText('ada@example.com')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Oct 5, 2026, 3:04 PM UTC')).toBeInTheDocument()
    expect(within(rows[0]).queryByText('Unverified')).not.toBeInTheDocument()
    expect(within(rows[1]).getByText('Unverified')).toBeInTheDocument()
  })

  it('disables the role select on the viewer’s own row only', () => {
    render(<AdminView users={page([ada, grace])} viewerId="u-ada" />)
    expect(screen.getByRole('combobox', { name: 'Role of Ada Lovelace' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Role of Grace Hopper' })).toBeEnabled()
  })

  it('changes another user’s role and confirms', async () => {
    vi.mocked(setUserRoleAction).mockResolvedValue({ ok: true, data: { ...grace, role: 'admin' } })
    render(<AdminView users={page([ada, grace])} viewerId="u-ada" />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Role of Grace Hopper' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Admin' }))
    expect(setUserRoleAction).toHaveBeenCalledWith({ id: 'u-grace', role: 'admin' })
    expect(toast.success).toHaveBeenCalledWith('Grace Hopper is now an admin')
  })

  it('shows the server’s message when the change fails', async () => {
    vi.mocked(setUserRoleAction).mockResolvedValue({
      ok: false,
      code: 'FORBIDDEN',
      message: 'You are not allowed to do that',
    })
    render(<AdminView users={page([ada, grace])} viewerId="u-ada" />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Role of Grace Hopper' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Admin' }))
    expect(toast.error).toHaveBeenCalledWith('You are not allowed to do that')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('writes the search to the URL and goes back to page 1', async () => {
    navigation.search = 'page=3'
    render(<AdminView users={page([ada], { page: 3, totalPages: 4 })} viewerId="u-ada" />)
    await userEvent.type(screen.getByLabelText('Search users'), '  grace ')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(navigation.replace).toHaveBeenCalledTimes(1)
    expect(navigation.replace).toHaveBeenCalledWith('/admin?q=grace', { scroll: false })
  })

  it('shows the search from the URL and follows it when it changes', () => {
    navigation.search = 'q=ada'
    const { rerender } = render(<AdminView users={page([ada])} viewerId="u-ada" />)
    expect(screen.getByLabelText('Search users')).toHaveValue('ada')
    navigation.search = 'q=grace'
    rerender(<AdminView users={page([grace])} viewerId="u-ada" />)
    expect(screen.getByLabelText('Search users')).toHaveValue('grace')
  })

  it('pages through the URL', async () => {
    render(
      <AdminView
        users={page([ada], { page: 1, totalItems: 25, totalPages: 3 })}
        viewerId="u-ada"
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(navigation.replace).toHaveBeenCalledWith('/admin?page=2', { scroll: false })
  })

  it('says so when nothing matches', () => {
    navigation.search = 'q=zzz'
    render(<AdminView users={page([], { totalItems: 0 })} viewerId="u-ada" />)
    expect(screen.getByText('No users found')).toBeInTheDocument()
    expect(screen.getByText('No user matches your search.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
