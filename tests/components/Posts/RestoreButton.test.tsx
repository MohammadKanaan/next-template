import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { restorePostAction } from '@/actions/posts'
import { RestorePostButton } from '@/components/Posts/RestoreButton'

vi.mock('@/actions/posts', () => ({ restorePostAction: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('RestorePostButton', () => {
  afterEach(() => vi.clearAllMocks())

  it('restores the post and confirms', async () => {
    vi.mocked(restorePostAction).mockResolvedValue({ ok: true, data: {} as never })
    render(<RestorePostButton postId={7} />)
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(restorePostAction).toHaveBeenCalledWith(7)
    expect(toast.success).toHaveBeenCalledWith('Post restored')
  })

  it('shows the server message when the restore is refused', async () => {
    vi.mocked(restorePostAction).mockResolvedValue({
      ok: false,
      code: 'NOT_FOUND',
      message: 'Post not found',
    })
    render(<RestorePostButton postId={7} />)
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(toast.error).toHaveBeenCalledWith('Post not found')
  })
})
