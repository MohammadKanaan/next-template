import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/Admin/ConfirmDialog'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const renderDialog = (
  onConfirm: () => Promise<
    { ok: true; data: unknown } | { ok: false; code: 'VALIDATION'; message: string }
  >,
  onDone = vi.fn(),
) =>
  render(
    <ConfirmDialog
      trigger="Delete"
      title="Delete Dune?"
      description="Its credits go with it."
      confirmLabel="Delete movie"
      onConfirm={onConfirm}
      onDone={onDone}
    />,
  )

describe('ConfirmDialog', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockReset()
  })

  it('stays closed until asked, then explains and waits for confirmation', async () => {
    const onConfirm = vi.fn(async () => ({ ok: true as const, data: undefined }))
    renderDialog(onConfirm)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    expect(screen.getByRole('heading', { name: 'Delete Dune?' })).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Its credits go with it.')
    expect(onConfirm).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('runs the action on confirmation, closes and reports success', async () => {
    const onConfirm = vi.fn(async () => ({ ok: true as const, data: undefined }))
    const onDone = vi.fn()
    renderDialog(onConfirm, onDone)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete movie' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('stays open and shows the message when the action fails', async () => {
    const onConfirm = vi.fn(async () => ({
      ok: false as const,
      code: 'VALIDATION' as const,
      message: 'Remove the genre from its 3 movies first',
    }))
    const onDone = vi.fn()
    renderDialog(onConfirm, onDone)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete movie' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Remove the genre from its 3 movies first',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })
})
