import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import {
  banUserAction,
  impersonateUserAction,
  setUserRoleAction,
  unbanUserAction,
} from '@/actions/admin'
import { AdminView } from '@/app/(site)/admin/view'
import type { Page } from '@/lib/dto/common'
import type { AdminUser } from '@/lib/dto/users'

const navigation = vi.hoisted(() => ({ search: '', replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(navigation.search),
}))
vi.mock('@/actions/admin', () => ({
  banUserAction: vi.fn(),
  impersonateUserAction: vi.fn(),
  setUserRoleAction: vi.fn(),
  unbanUserAction: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const ada: AdminUser = {
  id: 'u-ada',
  name: 'Ada Lovelace',
  username: 'ada',
  email: 'ada@example.com',
  emailVerified: true,
  role: 'admin',
  banned: false,
  banReason: null,
  createdAt: new Date('2026-10-05T15:04:00.000Z'),
}
const grace: AdminUser = {
  ...ada,
  id: 'u-grace',
  name: 'Grace Hopper',
  username: 'grace',
  email: 'grace@example.com',
  emailVerified: false,
  role: 'user',
}
const alan: AdminUser = {
  ...ada,
  id: 'u-alan',
  name: 'Alan Turing',
  username: 'alan',
  email: 'alan@example.com',
  role: 'user',
  banned: true,
  banReason: 'Spam',
}
const linus: AdminUser = {
  ...ada,
  id: 'u-linus',
  name: 'Linus Torvalds',
  username: 'linus',
  email: 'linus@example.com',
  role: 'admin',
}

const page = (items: AdminUser[], overrides: Partial<Page<AdminUser>> = {}): Page<AdminUser> => {
  return { items, page: 1, perPage: 10, totalItems: items.length, totalPages: 1, ...overrides }
}

/** The body rows, in order (the first row is the header). */
const rows = () => screen.getAllByRole('row').slice(1)

const rowOf = (name: string) => {
  const row = rows().find((candidate) => within(candidate).queryByText(name))
  if (!row) {
    throw new Error(`No row for ${name}`)
  }
  return row
}

describe('AdminView', () => {
  /** Impersonation changes who the browser is, so the view does a full navigation. */
  const assign = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('location', { assign })
    navigation.search = ''
    navigation.replace.mockReset()
    assign.mockReset()
    vi.mocked(banUserAction).mockReset()
    vi.mocked(impersonateUserAction).mockReset()
    vi.mocked(setUserRoleAction).mockReset()
    vi.mocked(unbanUserAction).mockReset()
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists users with email, status and join date, and flags unverified emails', () => {
    render(<AdminView users={page([ada, grace, alan])} viewerId="u-ada" />)
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual(['Name', 'Email', 'Role', 'Status', 'Joined', 'Actions'])
    expect(rows()).toHaveLength(3)
    const first = rows()[0]
    expect(within(first).getByText('Ada Lovelace')).toBeInTheDocument()
    expect(within(first).getByText('@ada')).toBeInTheDocument()
    expect(within(first).getByText('ada@example.com')).toBeInTheDocument()
    expect(within(first).getByText('Oct 5, 2026, 3:04 PM UTC')).toBeInTheDocument()
    expect(within(first).queryByText('Unverified')).not.toBeInTheDocument()
    expect(within(rowOf('Grace Hopper')).getByText('Unverified')).toBeInTheDocument()
  })

  it('shows Active or Banned, with the reason as the badge’s title', () => {
    render(<AdminView users={page([ada, grace, alan])} viewerId="u-ada" />)
    expect(within(rowOf('Ada Lovelace')).getByText('Active')).toBeInTheDocument()
    expect(within(rowOf('Grace Hopper')).getByText('Active')).toBeInTheDocument()
    const banned = within(rowOf('Alan Turing')).getByText('Banned')
    expect(banned).toHaveAttribute('title', 'Spam')
    expect(within(rowOf('Alan Turing')).queryByText('Active')).not.toBeInTheDocument()
  })

  it('offers no actions on the viewer’s own row and disables its role select', () => {
    render(<AdminView users={page([ada, grace])} viewerId="u-ada" />)
    const own = rowOf('Ada Lovelace')
    expect(screen.getByRole('combobox', { name: 'Role of Ada Lovelace' })).toBeDisabled()
    expect(within(own).queryAllByRole('button')).toEqual([])

    const other = rowOf('Grace Hopper')
    expect(screen.getByRole('combobox', { name: 'Role of Grace Hopper' })).toBeEnabled()
    expect(within(other).getByRole('button', { name: 'Ban' })).toBeEnabled()
    expect(within(other).getByRole('button', { name: 'Impersonate' })).toBeEnabled()
  })

  it('shows each user’s role by its label', () => {
    render(<AdminView users={page([ada, grace])} viewerId="u-ada" />)
    expect(screen.getByRole('combobox', { name: 'Role of Ada Lovelace' })).toHaveTextContent(
      'Admin',
    )
    expect(screen.getByRole('combobox', { name: 'Role of Grace Hopper' })).toHaveTextContent('User')
  })

  it('offers Ban but not Impersonate for another admin, and Unban only for a banned user', () => {
    render(<AdminView users={page([ada, linus, alan])} viewerId="u-ada" />)
    const admin = rowOf('Linus Torvalds')
    expect(within(admin).getByRole('button', { name: 'Ban' })).toBeInTheDocument()
    expect(within(admin).queryByRole('button', { name: 'Impersonate' })).not.toBeInTheDocument()

    const banned = rowOf('Alan Turing')
    expect(within(banned).getByRole('button', { name: 'Unban' })).toBeInTheDocument()
    expect(within(banned).queryByRole('button', { name: 'Ban' })).not.toBeInTheDocument()
    expect(within(banned).queryByRole('button', { name: 'Impersonate' })).not.toBeInTheDocument()
  })

  it('changes another user’s role and confirms', async () => {
    vi.mocked(setUserRoleAction).mockResolvedValue({ ok: true, data: { ...grace, role: 'admin' } })
    render(<AdminView users={page([ada, grace])} viewerId="u-ada" />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Role of Grace Hopper' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Admin' }))
    expect(setUserRoleAction).toHaveBeenCalledWith({ id: 'u-grace', role: 'admin' })
    expect(toast.success).toHaveBeenCalledWith('Grace Hopper is now an admin')
  })

  it('does nothing when the same role is picked again', async () => {
    render(<AdminView users={page([ada, grace])} viewerId="u-ada" />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Role of Grace Hopper' }))
    await userEvent.click(await screen.findByRole('option', { name: 'User' }))
    expect(setUserRoleAction).not.toHaveBeenCalled()
  })

  it('shows the server’s message when the role change fails', async () => {
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

  it('opens the ban dialog for the user from the Ban button', async () => {
    render(<AdminView users={page([ada, grace])} viewerId="u-ada" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(within(rowOf('Grace Hopper')).getByRole('button', { name: 'Ban' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Ban Grace Hopper?' })).toBeInTheDocument()
    expect(banUserAction).not.toHaveBeenCalled()
  })

  it('unbans a banned user and confirms', async () => {
    vi.mocked(unbanUserAction).mockResolvedValue({
      ok: true,
      data: { ...alan, banned: false, banReason: null },
    })
    render(<AdminView users={page([ada, alan])} viewerId="u-ada" />)
    await userEvent.click(within(rowOf('Alan Turing')).getByRole('button', { name: 'Unban' }))
    expect(unbanUserAction).toHaveBeenCalledWith('u-alan')
    expect(toast.success).toHaveBeenCalledWith('Alan Turing can sign in again')
  })

  it('shows the server’s message when unbanning fails', async () => {
    vi.mocked(unbanUserAction).mockResolvedValue({
      ok: false,
      code: 'NOT_FOUND',
      message: 'User not found',
    })
    render(<AdminView users={page([ada, alan])} viewerId="u-ada" />)
    await userEvent.click(within(rowOf('Alan Turing')).getByRole('button', { name: 'Unban' }))
    expect(toast.error).toHaveBeenCalledWith('User not found')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('impersonates a user and goes home', async () => {
    vi.mocked(impersonateUserAction).mockResolvedValue({ ok: true, data: null })
    render(<AdminView users={page([ada, grace])} viewerId="u-ada" />)
    await userEvent.click(
      within(rowOf('Grace Hopper')).getByRole('button', { name: 'Impersonate' }),
    )
    expect(impersonateUserAction).toHaveBeenCalledWith('u-grace')
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/'))
  })

  it('stays on the page and shows the message when impersonation fails', async () => {
    vi.mocked(impersonateUserAction).mockResolvedValue({
      ok: false,
      code: 'FORBIDDEN',
      message: 'You cannot impersonate admins',
    })
    render(<AdminView users={page([ada, grace])} viewerId="u-ada" />)
    await userEvent.click(
      within(rowOf('Grace Hopper')).getByRole('button', { name: 'Impersonate' }),
    )
    expect(toast.error).toHaveBeenCalledWith('You cannot impersonate admins')
    expect(assign).not.toHaveBeenCalled()
  })

  it('disables every control while one change is saving', async () => {
    let finish: (value: { ok: true; data: null }) => void = () => {}
    vi.mocked(impersonateUserAction).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    render(<AdminView users={page([ada, grace, alan])} viewerId="u-ada" />)
    await userEvent.click(
      within(rowOf('Grace Hopper')).getByRole('button', { name: 'Impersonate' }),
    )
    expect(screen.getByRole('combobox', { name: 'Role of Grace Hopper' })).toBeDisabled()
    expect(within(rowOf('Grace Hopper')).getByRole('button', { name: 'Ban' })).toBeDisabled()
    expect(within(rowOf('Alan Turing')).getByRole('button', { name: 'Unban' })).toBeDisabled()

    finish({ ok: true, data: null })
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/'))
    expect(screen.getByRole('combobox', { name: 'Role of Grace Hopper' })).toBeEnabled()
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

  it('says there are no users yet without a search', () => {
    render(<AdminView users={page([], { totalItems: 0 })} viewerId="u-ada" />)
    expect(screen.getByText('There are no users yet.')).toBeInTheDocument()
  })
})
