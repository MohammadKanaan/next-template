import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { updatePostAction } from '@/actions/posts'
import { PostEditView } from '@/app/(site)/posts/[id]/edit/view'
import type { PostDetail } from '@/lib/dto/posts'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }))
vi.mock('@/actions/posts', () => ({ updatePostAction: vi.fn() }))

const post: PostDetail = {
  id: '0190d1a2-0000-7000-8000-000000000007',
  title: 'Hello',
  body: 'World',
  published: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  author: {
    id: '0190d1a2-0000-7000-8000-0000000000a1',
    name: 'Leanne Graham',
    username: 'leanne',
    website: null,
  },
  permissions: { update: true, delete: true },
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

describe('PostEditView', () => {
  afterEach(() => vi.clearAllMocks())

  it('submits only the changed attributes and opens the post', async () => {
    vi.mocked(updatePostAction).mockResolvedValue({ ok: true, data: { ...post, title: 'Hello!' } })
    render(<PostEditView post={post} />)
    await userEvent.type(screen.getByLabelText(/Title/), '!')
    await save()
    expect(updatePostAction).toHaveBeenCalledTimes(1)
    expect(updatePostAction).toHaveBeenCalledWith(post.id, { title: 'Hello!' })
    expect(toast.success).toHaveBeenCalledWith('Post updated')
    expect(push).toHaveBeenCalledWith('/posts/0190d1a2-0000-7000-8000-000000000007')
  })

  it('publishes a draft by sending the published flag alone', async () => {
    vi.mocked(updatePostAction).mockResolvedValue({ ok: true, data: { ...post, published: true } })
    render(<PostEditView post={post} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Published' }))
    await save()
    expect(updatePostAction).toHaveBeenCalledWith(post.id, { published: true })
    expect(push).toHaveBeenCalledWith('/posts/0190d1a2-0000-7000-8000-000000000007')
  })

  it('says there is nothing to save when the trimmed values equal the post', async () => {
    render(<PostEditView post={post} />)
    // A trailing space makes the form dirty, but the trimmed title is the one the post has.
    await userEvent.type(screen.getByLabelText(/Title/), ' ')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    await save()
    expect(updatePostAction).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith('No changes to save')
    expect(toast.success).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the server error as the form alert and stays on the page', async () => {
    vi.mocked(updatePostAction).mockResolvedValue({
      ok: false,
      code: 'FORBIDDEN',
      message: 'You cannot change this post',
    })
    render(<PostEditView post={post} />)
    await userEvent.type(screen.getByLabelText(/Title/), '!')
    await save()
    expect(await screen.findByRole('alert')).toHaveTextContent('You cannot change this post')
    expect(toast.success).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('puts server field errors on the fields', async () => {
    vi.mocked(updatePostAction).mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      message: 'Validation failed',
      fieldErrors: { body: ['Body is too plain'] },
    })
    render(<PostEditView post={post} />)
    await userEvent.type(screen.getByLabelText(/Body/), '!')
    await save()
    expect(await screen.findByText('Body is too plain')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('goes back to the post on cancel', async () => {
    render(<PostEditView post={post} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(push).toHaveBeenCalledWith('/posts/0190d1a2-0000-7000-8000-000000000007')
    expect(updatePostAction).not.toHaveBeenCalled()
  })
})
