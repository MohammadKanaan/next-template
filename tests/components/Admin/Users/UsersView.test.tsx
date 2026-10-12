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
import { UsersView } from '@/components/Admin/Users/UsersView'
import type { Page } from '@/lib/dto/common'
import type { AdminUser } from '@/lib/dto/users'

const navigation = vi.hoisted(() => ({ search: '', replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => '/admin/users',
  useSearchParams: () => new URLSearchParams(navigation.search),
}))
vi.mock('@/actions/admin', () => ({
  banUserAction: vi.fn(),
  impersonateUserAction: vi.fn(),
  setUserRoleAction: vi.fn(),
  unbanUserAction: vi.fn(),
  revokeUserSessionsAction: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const ADA_ID = '0190d1a2-0000-7000-8000-00000000ada0'
const GRACE_ID = '0190d1a2-0000-7000-8000-00000000c0de'
const ALAN_ID = '0190d1a2-0000-7000-8000-00000000a1a1'
const LINUS_ID = '0190d1a2-0000-7000-8000-00000000115f'

const ada: AdminUser = {
  id: ADA_ID,
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
  id: GRACE_ID,
  name: 'Grace Hopper',
  username: 'grace',
  email: 'grace@example.com',
  emailVerified: false,
  role: 'user',
}
const alan: AdminUser = {
  ...ada,
  id: ALAN_ID,
  name: 'Alan Turing',
  username: 'alan',
  email: 'alan@example.com',
  role: 'user',
  banned: true,
  banReason: 'Spam',
}
const linus: AdminUser = {
  ...ada,
  id: LINUS_ID,
  name: 'Linus Torvalds',
  username: 'linus',
  email: 'linus@example.com',
  role: 'admin',
}

const page = (items: AdminUser[], overrides: Partial<Page<AdminUser>> = {}): Page<AdminUser> => {
  return { items, page: 1, perPage: 20, totalItems: items.length, totalPages: 1, ...overrides }
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

describe('UsersView', () => {
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

  it('toggles column sorting while keeping filters and resetting the page', async () => {
    navigation.search = 'page=3&q=ada&role=admin'
    const { rerender } = render(<UsersView users={page([ada])} viewerId={ADA_ID} />)
    await userEvent.click(screen.getByRole('button', { name: 'Name' }))
    let params = new URLSearchParams(navigation.replace.mock.lastCall?.[0].split('?')[1])
    expect(Object.fromEntries(params)).toEqual({
      q: 'ada',
      role: 'admin',
      sortBy: 'name',
      direction: 'asc',
    })
    navigation.search = params.toString()
    rerender(<UsersView users={page([ada])} viewerId={ADA_ID} />)
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Name' }))
    params = new URLSearchParams(navigation.replace.mock.lastCall?.[0].split('?')[1])
    expect(params.get('direction')).toBeNull()
    expect(params.get('sortBy')).toBe('name')
  })

  it('lists users with email, status and join date, linking each name to its page', () => {
    render(<UsersView users={page([ada, grace, alan])} viewerId={ADA_ID} />)
    expect(rows()).toHaveLength(3)
    const first = rows()[0]
    expect(within(first).getByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute(
      'href',
      `/admin/users/${ADA_ID}`,
    )
    expect(within(first).getByText('@ada')).toBeInTheDocument()
    expect(within(first).getByText('ada@example.com')).toBeInTheDocument()
    expect(within(first).getByText('Oct 5, 2026')).toBeInTheDocument()
    expect(within(first).queryByText('Unverified')).not.toBeInTheDocument()
    expect(within(rowOf('Grace Hopper')).getByText('Unverified')).toBeInTheDocument()
  })

  it('shows Active or Banned, with the reason as the badge’s title', () => {
    render(<UsersView users={page([ada, grace, alan])} viewerId={ADA_ID} />)
    expect(within(rowOf('Ada Lovelace')).getByText('Active')).toBeInTheDocument()
    const banned = within(rowOf('Alan Turing')).getByText('Banned')
    expect(banned).toHaveAttribute('title', 'Spam')
    expect(within(rowOf('Alan Turing')).queryByText('Active')).not.toBeInTheDocument()
  })

  it('offers no actions on the viewer’s own row and disables its role select', () => {
    render(<UsersView users={page([ada, grace])} viewerId={ADA_ID} />)
    const own = rowOf('Ada Lovelace')
    expect(screen.getByRole('combobox', { name: 'Role of Ada Lovelace' })).toBeDisabled()
    expect(within(own).queryAllByRole('button')).toEqual([])

    const other = rowOf('Grace Hopper')
    expect(screen.getByRole('combobox', { name: 'Role of Grace Hopper' })).toBeEnabled()
    expect(within(other).getByRole('button', { name: 'Ban' })).toBeEnabled()
    expect(within(other).getByRole('button', { name: 'Impersonate' })).toBeEnabled()
  })

  it('offers Ban but not Impersonate for another admin, and Unban only for a banned user', () => {
    render(<UsersView users={page([ada, linus, alan])} viewerId={ADA_ID} />)
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
    render(<UsersView users={page([ada, grace])} viewerId={ADA_ID} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Role of Grace Hopper' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Admin' }))
    expect(setUserRoleAction).toHaveBeenCalledWith({ id: GRACE_ID, role: 'admin' })
    expect(toast.success).toHaveBeenCalledWith('Grace Hopper is now an admin')
  })

  it('shows the server’s message when the role change fails', async () => {
    vi.mocked(setUserRoleAction).mockResolvedValue({
      ok: false,
      code: 'FORBIDDEN',
      message: 'You are not allowed to do that',
    })
    render(<UsersView users={page([ada, grace])} viewerId={ADA_ID} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Role of Grace Hopper' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Admin' }))
    expect(toast.error).toHaveBeenCalledWith('You are not allowed to do that')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('unbans a banned user and confirms', async () => {
    vi.mocked(unbanUserAction).mockResolvedValue({
      ok: true,
      data: { ...alan, banned: false, banReason: null },
    })
    render(<UsersView users={page([ada, alan])} viewerId={ADA_ID} />)
    await userEvent.click(within(rowOf('Alan Turing')).getByRole('button', { name: 'Unban' }))
    expect(unbanUserAction).toHaveBeenCalledWith(ALAN_ID)
    expect(toast.success).toHaveBeenCalledWith('Alan Turing can sign in again')
  })

  it('impersonates a user and goes home', async () => {
    vi.mocked(impersonateUserAction).mockResolvedValue({ ok: true, data: null })
    render(<UsersView users={page([ada, grace])} viewerId={ADA_ID} />)
    await userEvent.click(
      within(rowOf('Grace Hopper')).getByRole('button', { name: 'Impersonate' }),
    )
    expect(impersonateUserAction).toHaveBeenCalledWith(GRACE_ID)
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/'))
  })

  it('disables every row’s controls while one change is saving', async () => {
    let finish: (value: { ok: true; data: null }) => void = () => {}
    vi.mocked(impersonateUserAction).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    render(<UsersView users={page([ada, grace, alan])} viewerId={ADA_ID} />)
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
    render(<UsersView users={page([ada], { page: 3, totalPages: 4 })} viewerId={ADA_ID} />)
    await userEvent.type(screen.getByLabelText('Search users'), '  grace ')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(navigation.replace).toHaveBeenCalledTimes(1)
    expect(navigation.replace).toHaveBeenCalledWith('/admin/users?q=grace', { scroll: false })
  })

  it('filters by role and by status through the URL, back on page 1', async () => {
    navigation.search = 'page=2'
    render(<UsersView users={page([ada, grace], { page: 2, totalPages: 3 })} viewerId={ADA_ID} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Role' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Users' }))
    expect(navigation.replace).toHaveBeenLastCalledWith('/admin/users?role=user', {
      scroll: false,
    })
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Banned' }))
    expect(navigation.replace).toHaveBeenLastCalledWith('/admin/users?role=user&status=banned', {
      scroll: false,
    })
  })

  it('shows the filters from the URL and clears them', async () => {
    navigation.search = 'role=admin&status=active&q=ada'
    render(<UsersView users={page([ada])} viewerId={ADA_ID} />)
    expect(screen.getByLabelText('Search users')).toHaveValue('ada')
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveTextContent('Admins')
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Active')
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(navigation.replace).toHaveBeenLastCalledWith('/admin/users', { scroll: false })
  })

  it('pages through the URL', async () => {
    render(
      <UsersView
        users={page([ada], { page: 1, totalItems: 25, totalPages: 3 })}
        viewerId={ADA_ID}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(navigation.replace).toHaveBeenCalledWith('/admin/users?page=2', { scroll: false })
  })

  it('says so when nothing matches, and that there are no users yet without a filter', () => {
    navigation.search = 'q=zzz'
    const { rerender } = render(<UsersView users={page([], { totalItems: 0 })} viewerId={ADA_ID} />)
    expect(screen.getByText('No users found')).toBeInTheDocument()
    expect(screen.getByText('No user matches your filters.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    navigation.search = ''
    rerender(<UsersView users={page([], { totalItems: 0 })} viewerId={ADA_ID} />)
    expect(screen.getByText('There are no users yet.')).toBeInTheDocument()
  })
})
