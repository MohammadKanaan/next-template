import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActionButton } from '@/components/ActionButton'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

describe('ActionButton', () => {
  it('is an icon button named by its label', async () => {
    const onClick = vi.fn()
    render(<ActionButton action="edit" label="Edit comment" onClick={onClick} />)
    const button = screen.getByRole('button', { name: 'Edit comment' })
    expect(button).toHaveTextContent('')
    expect(button.querySelector('svg')).not.toBeNull()
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('shows its label as a tooltip on hover', async () => {
    render(<ActionButton action="delete" label="Delete review" />)
    await userEvent.hover(screen.getByRole('button', { name: 'Delete review' }))
    // The label is only the button's aria-label, so visible text is the tooltip.
    expect(await screen.findByText('Delete review')).toBeInTheDocument()
  })

  it('describes why it is disabled', () => {
    render(
      <ActionButton
        action="delete"
        label="Delete Drama"
        disabled
        disabledReason="Remove the genre from its movies first"
      />,
    )
    const button = screen.getByRole('button', { name: 'Delete Drama' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription('Remove the genre from its movies first')
  })

  it('opens a dialog as its trigger', async () => {
    render(
      <Dialog>
        <DialogTrigger render={<ActionButton action="delete" label="Delete review" />} />
        <DialogContent>
          <DialogTitle>Delete this review?</DialogTitle>
        </DialogContent>
      </Dialog>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Delete review' }))
    expect(await screen.findByRole('dialog', { name: 'Delete this review?' })).toBeInTheDocument()
  })
})
