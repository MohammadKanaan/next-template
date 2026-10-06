import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setPostStatusAction } from '@/actions/posts'
import { PostStatusActions } from '@/components/Posts/StatusActions'
import { POST_STATUS_TRANSITIONS, postStatusSchema } from '@/lib/dto/posts'

vi.mock('@/actions/posts', () => ({ setPostStatusAction: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('PostStatusActions', () => {
  afterEach(() => vi.clearAllMocks())

  it('offers exactly the moves the transition map allows', () => {
    const labels = { published: 'Publish', archived: 'Archive', draft: 'Unpublish' }
    for (const status of postStatusSchema.options) {
      const { unmount } = render(<PostStatusActions postId={1} status={status} />)
      expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(
        POST_STATUS_TRANSITIONS[status].map((next) => labels[next]),
      )
      unmount()
    }
  })

  it('moves the post and confirms', async () => {
    vi.mocked(setPostStatusAction).mockResolvedValue({ ok: true, data: {} as never })
    render(<PostStatusActions postId={7} status="draft" />)
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(setPostStatusAction).toHaveBeenCalledWith(7, 'published')
    expect(toast.success).toHaveBeenCalledWith('Post published')
  })

  it('shows the server message when the move is refused', async () => {
    vi.mocked(setPostStatusAction).mockResolvedValue({
      ok: false,
      code: 'FORBIDDEN',
      message: 'You cannot change this post',
    })
    render(<PostStatusActions postId={7} status="published" />)
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(toast.error).toHaveBeenCalledWith('You cannot change this post')
    expect(toast.success).not.toHaveBeenCalled()
  })
})
