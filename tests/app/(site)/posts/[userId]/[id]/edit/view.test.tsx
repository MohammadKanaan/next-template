import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { updatePostAction } from '@/actions/posts'
import { PostEditView } from '@/app/(site)/posts/[userId]/[id]/edit/view'
import type { PostDetail } from '@/lib/dto/posts'

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }))
vi.mock('@/actions/posts', () => ({ updatePostAction: vi.fn() }))

const post: PostDetail = {
  id: 7,
  title: 'Hello',
  body: 'World',
  status: 'draft',
  version: 4,
  tags: [],
  commentCount: 0,
  publishedAt: null,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  author: { id: 'u1', name: 'Leanne Graham', username: 'leanne', website: null },
  permissions: { update: true, delete: true, restore: false },
}

describe('PostEditView', () => {
  afterEach(() => vi.clearAllMocks())

  it('saves the changed fields together with the version it was loaded with', async () => {
    vi.mocked(updatePostAction).mockResolvedValue({
      ok: true,
      data: { id: 7, author: { id: 'u1' } } as never,
    })
    render(<PostEditView post={post} />)
    await userEvent.type(screen.getByLabelText(/Title/), '!')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(updatePostAction).toHaveBeenCalledWith(7, { title: 'Hello!', version: 4 })
    expect(push).toHaveBeenCalledWith('/posts/u1/7')
  })

  it('shows a conflict as the form alert with a Reload button that refreshes the page', async () => {
    vi.mocked(updatePostAction).mockResolvedValue({
      ok: false,
      code: 'CONFLICT',
      message: 'The post was changed meanwhile. Reload and try again.',
    })
    render(<PostEditView post={post} />)
    await userEvent.type(screen.getByLabelText(/Title/), '!')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('changed meanwhile')
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
  })

  it('offers no Reload for other failures', async () => {
    vi.mocked(updatePostAction).mockResolvedValue({
      ok: false,
      code: 'FORBIDDEN',
      message: 'You cannot change this post',
    })
    render(<PostEditView post={post} />)
    await userEvent.type(screen.getByLabelText(/Title/), '!')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You cannot change this post')
    expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument()
  })
})
