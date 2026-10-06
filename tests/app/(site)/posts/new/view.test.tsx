import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPostAction } from '@/actions/posts'
import { PostNewView } from '@/app/(site)/posts/new/view'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/actions/posts', () => ({ createPostAction: vi.fn() }))

const typeInto = async (title: string, body: string) => {
  await userEvent.type(screen.getByLabelText(/Title/), title)
  await userEvent.type(screen.getByLabelText(/Body/), body)
}

describe('PostNewView', () => {
  afterEach(() => vi.clearAllMocks())

  it('creates the post and opens it', async () => {
    vi.mocked(createPostAction).mockResolvedValue({
      ok: true,
      data: { id: 7, author: { id: 'u1' } } as never,
    })
    render(<PostNewView />)
    await typeInto('Published', 'Text')
    await userEvent.click(screen.getByRole('button', { name: 'Create post' }))
    expect(createPostAction).toHaveBeenCalledWith({ title: 'Published', body: 'Text', tags: [] })
    expect(push).toHaveBeenCalledWith('/posts/u1/7')
  })

  it('shows the server error and stays on the page when the action fails', async () => {
    vi.mocked(createPostAction).mockResolvedValue({
      ok: false,
      code: 'FORBIDDEN',
      message: 'You cannot post right now',
    })
    render(<PostNewView />)
    await typeInto('Title', 'Body')
    await userEvent.click(screen.getByRole('button', { name: 'Create post' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You cannot post right now')
    expect(push).not.toHaveBeenCalled()
  })

  it('goes back to the posts page on cancel', async () => {
    render(<PostNewView />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(push).toHaveBeenCalledWith('/posts')
    expect(createPostAction).not.toHaveBeenCalled()
  })
})
