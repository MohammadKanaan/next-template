import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommentItem } from '@/components/Comments/Item'
import type { Comment } from '@/lib/dto/comments'

const deleteButtonProps = vi.hoisted(() => vi.fn())

vi.mock('@/components/Comments/DeleteButton', () => ({
  DeleteCommentButton: (props: Record<string, unknown>) => {
    deleteButtonProps(props)
    return null
  },
}))

const comment: Comment = {
  id: 3,
  body: 'Hello',
  createdAt: new Date('2026-10-07T10:00:00.000Z'),
  author: { id: 'u1', name: 'Casey', username: 'casey', website: null },
  permissions: { delete: true },
}

describe('CommentItem', () => {
  it('passes no handler to the delete button when the caller gave none', () => {
    // The thread renders the item in a Server Component, which cannot hand a function to a
    // Client Component: React's Flight serializer throws "Event handlers cannot be passed to Client
    // Component props" and the page error boundary replaces the post (review C1).
    render(<CommentItem comment={comment} />)
    expect(deleteButtonProps).toHaveBeenCalledWith({ commentId: 3, onDeleted: undefined })
  })

  it('hands the comment to the caller once the delete button reports the deletion', () => {
    const onDeleted = vi.fn()
    render(<CommentItem comment={comment} onDeleted={onDeleted} />)
    const props = deleteButtonProps.mock.lastCall?.[0] as { onDeleted: () => void }
    props.onDeleted()
    expect(onDeleted).toHaveBeenCalledWith(comment)
  })
})
