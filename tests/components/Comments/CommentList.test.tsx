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

const list = (nextCursor: string | null, first: Comment[], commentCount: number) => (
  <CommentList postId={7} nextCursor={nextCursor} commentCount={commentCount}>
    {first.map((item) => (
      <CommentItem key={item.id} comment={item} />
    ))}
  </CommentList>
)

const renderList = (nextCursor: string | null, first: Comment[] = [comment(1)]) => {
  return render(list(nextCursor, first, first.length))
}

const range = (from: number, to: number) => {
  return Array.from({ length: to - from + 1 }, (_, index) => comment(from + index))
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

  it('shows Load more for a comment that pushed the thread past the first page', () => {
    // 20 comments fit the first page exactly, so there was no button; comment 21 is on page 2.
    const { rerender } = render(list(null, range(1, 20), 20))
    expect(screen.queryByRole('button', { name: 'Load more comments' })).not.toBeInTheDocument()
    rerender(list('c20', range(1, 20), 21))
    expect(screen.getByRole('button', { name: 'Load more comments' })).toBeInTheDocument()
  })

  it('does not show a comment twice when a delete moves it into the first page', async () => {
    vi.mocked(fetchComments).mockResolvedValue({ items: [comment(21)], nextCursor: null })
    const { rerender } = render(list('c20', range(1, 20), 21))
    await userEvent.click(screen.getByRole('button', { name: 'Load more comments' }))
    await screen.findByText('Comment 21')
    // Comment 5 is deleted: the refreshed first page now ends with comment 21.
    rerender(list(null, [...range(1, 4), ...range(6, 21)], 20))
    expect(screen.getAllByText('Comment 21')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Load more comments' })).not.toBeInTheDocument()
  })

  it('keeps the loaded pages while the thread is unchanged', async () => {
    vi.mocked(fetchComments).mockResolvedValue({ items: [comment(2)], nextCursor: null })
    const { rerender } = render(list('c1', [comment(1)], 2))
    await userEvent.click(screen.getByRole('button', { name: 'Load more comments' }))
    await screen.findByText('Comment 2')
    rerender(list('c1', [comment(1)], 2))
    expect(screen.getByText('Comment 2')).toBeInTheDocument()
  })
})
