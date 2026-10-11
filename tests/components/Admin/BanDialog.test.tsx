import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { banUserAction } from '@/actions/admin'
import { BanUserDialog } from '@/components/Admin/BanDialog'
import { BAN_REASON_MAX_LENGTH, type AdminUser } from '@/lib/dto/users'

vi.mock('@/actions/admin', () => ({ banUserAction: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const grace: AdminUser = {
  id: 'u-grace',
  name: 'Grace Hopper',
  username: 'grace',
  email: 'grace@example.com',
  emailVerified: true,
  role: 'user',
  banned: false,
  banReason: null,
  createdAt: new Date('2026-10-05T15:04:00.000Z'),
}

const open = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Ban' }))
  return screen.findByRole('dialog')
}

describe('BanUserDialog', () => {
  beforeEach(() => {
    vi.mocked(banUserAction).mockReset()
    vi.mocked(toast.success).mockReset()
  })

  it('stays closed until asked, then names the user and explains what a ban does', async () => {
    render(<BanUserDialog user={grace} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const dialog = await open()
    expect(screen.getByRole('heading', { name: 'Ban Grace Hopper?' })).toBeInTheDocument()
    expect(dialog).toHaveTextContent(
      'They are signed out everywhere and cannot sign in until you unban them.',
    )
    expect(screen.getByLabelText('Reason')).toHaveValue('')
    expect(banUserAction).not.toHaveBeenCalled()
  })

  it('can be disabled from outside', () => {
    render(<BanUserDialog user={grace} disabled />)
    expect(screen.getByRole('button', { name: 'Ban' })).toBeDisabled()
  })

  it('bans without a reason, confirms with a toast and closes', async () => {
    vi.mocked(banUserAction).mockResolvedValue({
      ok: true,
      data: { ...grace, banned: true, banReason: 'No reason' },
    })
    render(<BanUserDialog user={grace} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Ban user' }))
    expect(banUserAction).toHaveBeenCalledWith({ id: 'u-grace', reason: '' })
    expect(toast.success).toHaveBeenCalledWith('Grace Hopper is banned')
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('sends the trimmed reason along', async () => {
    vi.mocked(banUserAction).mockResolvedValue({
      ok: true,
      data: { ...grace, banned: true, banReason: 'Spam' },
    })
    render(<BanUserDialog user={grace} />)
    await open()
    await userEvent.type(screen.getByLabelText('Reason'), '  Spam  ')
    await userEvent.click(screen.getByRole('button', { name: 'Ban user' }))
    expect(banUserAction).toHaveBeenCalledWith({ id: 'u-grace', reason: 'Spam' })
  })

  it('refuses a reason that is too long before calling the server', async () => {
    render(<BanUserDialog user={grace} />)
    await open()
    await userEvent.click(screen.getByLabelText('Reason'))
    await userEvent.paste('x'.repeat(BAN_REASON_MAX_LENGTH + 1))
    await userEvent.click(screen.getByRole('button', { name: 'Ban user' }))
    expect(
      await screen.findByText(`Reason must be ${BAN_REASON_MAX_LENGTH} characters or fewer`),
    ).toBeInTheDocument()
    expect(banUserAction).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('puts a server field error on the reason and stays open', async () => {
    vi.mocked(banUserAction).mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      message: 'Validation failed',
      fieldErrors: { reason: ['Reason must be 200 characters or fewer'] },
    })
    render(<BanUserDialog user={grace} />)
    await open()
    await userEvent.type(screen.getByLabelText('Reason'), 'Spam')
    await userEvent.click(screen.getByRole('button', { name: 'Ban user' }))
    expect(await screen.findByText('Reason must be 200 characters or fewer')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Reason')).toHaveValue('Spam')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('shows any other failure as an alert and stays open', async () => {
    vi.mocked(banUserAction).mockResolvedValue({
      ok: false,
      code: 'FORBIDDEN',
      message: 'You cannot ban yourself',
    })
    render(<BanUserDialog user={grace} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Ban user' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You cannot ban yourself')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('forgets the reason and the error when cancelled', async () => {
    vi.mocked(banUserAction).mockResolvedValue({
      ok: false,
      code: 'NOT_FOUND',
      message: 'User not found',
    })
    render(<BanUserDialog user={grace} />)
    await open()
    await userEvent.type(screen.getByLabelText('Reason'), 'Spam')
    await userEvent.click(screen.getByRole('button', { name: 'Ban user' }))
    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await open()
    expect(screen.getByLabelText('Reason')).toHaveValue('')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
