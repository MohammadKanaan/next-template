import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteCommentAction } from '@/actions/comments'
import { DeleteCommentButton } from '@/components/Comments/DeleteButton'

vi.mock('@/actions/comments', () => ({ deleteCommentAction: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('DeleteCommentButton', () => {
  afterEach(() => vi.clearAllMocks())

  it('deletes the comment and confirms', async () => {
    vi.mocked(deleteCommentAction).mockResolvedValue({ ok: true, data: null })
    render(<DeleteCommentButton commentId={9} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete comment' }))
    expect(deleteCommentAction).toHaveBeenCalledWith(9)
    expect(toast.success).toHaveBeenCalledWith('Comment deleted')
  })

  it('shows the server message when it fails', async () => {
    vi.mocked(deleteCommentAction).mockResolvedValue({
      ok: false,
      code: 'FORBIDDEN',
      message: 'You cannot delete this comment',
    })
    render(<DeleteCommentButton commentId={9} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete comment' }))
    expect(toast.error).toHaveBeenCalledWith('You cannot delete this comment')
  })
})
