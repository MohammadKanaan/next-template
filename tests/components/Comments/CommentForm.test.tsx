import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCommentAction } from '@/actions/comments'
import { CommentForm } from '@/components/Comments/Form'

vi.mock('@/actions/comments', () => ({ createCommentAction: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('CommentForm', () => {
  afterEach(() => vi.clearAllMocks())

  it('does not submit an empty comment', async () => {
    render(<CommentForm postId={3} />)
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }))
    expect(await screen.findByText('Comment is required')).toBeInTheDocument()
    expect(createCommentAction).not.toHaveBeenCalled()
  })

  it('submits the trimmed comment for the post and clears the field', async () => {
    vi.mocked(createCommentAction).mockResolvedValue({ ok: true, data: {} as never })
    render(<CommentForm postId={3} />)
    await userEvent.type(screen.getByLabelText('Add a comment'), '  Great post  ')
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }))
    expect(createCommentAction).toHaveBeenCalledWith(3, { body: 'Great post' })
    expect(toast.success).toHaveBeenCalledWith('Comment added')
    expect(screen.getByLabelText('Add a comment')).toHaveValue('')
  })

  it('keeps the text and shows the server message when the action fails', async () => {
    vi.mocked(createCommentAction).mockResolvedValue({
      ok: false,
      code: 'FORBIDDEN',
      message: 'Comments are only open on published posts',
    })
    render(<CommentForm postId={3} />)
    await userEvent.type(screen.getByLabelText('Add a comment'), 'Hello')
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Comments are only open on published posts',
    )
    expect(screen.getByLabelText('Add a comment')).toHaveValue('Hello')
  })
})
