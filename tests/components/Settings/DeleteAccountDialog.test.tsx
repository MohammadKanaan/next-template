import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DeleteAccountDialog } from '@/components/Settings/DeleteAccountDialog'

const open = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Delete account' }))
  return screen.findByRole('dialog')
}

describe('DeleteAccountDialog', () => {
  it('stays closed until asked, then explains what is lost', async () => {
    render(<DeleteAccountDialog onConfirm={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const dialog = await open()
    expect(dialog).toHaveTextContent('permanently removes your account')
  })

  it('needs the password before it confirms', async () => {
    const onConfirm = vi.fn()
    render(<DeleteAccountDialog onConfirm={onConfirm} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }))
    expect(await screen.findByText('Password is required')).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirms with the password', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: true, data: null })
    render(<DeleteAccountDialog onConfirm={onConfirm} />)
    await open()
    await userEvent.type(screen.getByLabelText(/Password/), 'my-password-1')
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }))
    expect(onConfirm).toHaveBeenCalledWith({ password: 'my-password-1' })
  })

  it('puts a wrong password on its field and stays open', async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      message: 'Validation failed',
      fieldErrors: { password: ['Password is incorrect'] },
    })
    render(<DeleteAccountDialog onConfirm={onConfirm} />)
    await open()
    await userEvent.type(screen.getByLabelText(/Password/), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }))
    expect(await screen.findByText('Password is incorrect')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('forgets the password and the error when cancelled', async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      message: 'Validation failed',
      fieldErrors: { password: ['Password is incorrect'] },
    })
    render(<DeleteAccountDialog onConfirm={onConfirm} />)
    await open()
    await userEvent.type(screen.getByLabelText(/Password/), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }))
    await screen.findByText('Password is incorrect')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await open()
    expect(screen.getByLabelText(/Password/)).toHaveValue('')
    expect(screen.queryByText('Password is incorrect')).not.toBeInTheDocument()
  })
})
