import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteCommentAction } from '@/actions/comments'
import { CommentItem } from '@/components/Comments/Item'
import { CommentList } from '@/components/Comments/List'
import { fetchComments } from '@/lib/client/comments'
import type { Comment } from '@/lib/dto/comments'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/actions/comments', () => ({ deleteCommentAction: vi.fn() }))
vi.mock('@/lib/client/comments', () => ({ fetchComments: vi.fn() }))

const comment = (id: number, canDelete = false): Comment => ({
  id,
  body: `Comment ${id}`,
  createdAt: new Date('2026-10-07T10:00:00.000Z'),
  author: { id: 'u1', name: 'Casey', username: 'casey', website: null },
  permissions: { delete: canDelete },
})

const renderList = (nextCursor: string | null, first: Comment[] = [comment(1)]) => {
  return render(
    <CommentList postId={7} nextCursor={nextCursor}>
      {first.map((item) => (
        <CommentItem key={item.id} comment={item} />
      ))}
    </CommentList>,
  )
}

describe('CommentList', () => {
  afterEach(() => vi.clearAllMocks())

  it('shows the first page it is given and no button on the last page', () => {
    renderList(null)
    expect(screen.getByText('Comment 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more comments' })).not.toBeInTheDocument()
  })

  it('loads the next page after the first one and drops the button on the last page', async () => {
    vi.mocked(fetchComments).mockResolvedValue({
      items: [comment(2), comment(3)],
      nextCursor: null,
    })
    renderList('c1')
    await userEvent.click(screen.getByRole('button', { name: 'Load more comments' }))
    expect(await screen.findByText('Comment 3')).toBeInTheDocument()
    expect(fetchComments).toHaveBeenCalledWith(7, { cursor: 'c1' }, expect.any(AbortSignal))
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Comment 1'),
      expect.stringContaining('Comment 2'),
      expect.stringContaining('Comment 3'),
    ])
    expect(screen.queryByRole('button', { name: 'Load more comments' })).not.toBeInTheDocument()
  })

  it('shows a failed load and keeps the button for another try', async () => {
    vi.mocked(fetchComments).mockRejectedValue(new Error('Network down'))
    renderList('c1')
    await userEvent.click(screen.getByRole('button', { name: 'Load more comments' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down')
    expect(screen.getByRole('button', { name: 'Load more comments' })).toBeEnabled()
  })

  it('removes a deleted comment of a loaded page at once', async () => {
    vi.mocked(fetchComments).mockResolvedValue({ items: [comment(2, true)], nextCursor: null })
    vi.mocked(deleteCommentAction).mockResolvedValue({ ok: true, data: null })
    renderList('c1')
    await userEvent.click(screen.getByRole('button', { name: 'Load more comments' }))
    await screen.findByText('Comment 2')
    await userEvent.click(screen.getByRole('button', { name: 'Delete comment' }))
    expect(deleteCommentAction).toHaveBeenCalledWith(2)
    expect(screen.queryByText('Comment 2')).not.toBeInTheDocument()
    expect(screen.getByText('Comment 1')).toBeInTheDocument()
  })
})
