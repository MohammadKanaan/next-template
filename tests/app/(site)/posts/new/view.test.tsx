import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createPostAction } from '@/actions/posts'
import { PostNewView } from '@/app/(site)/posts/new/view'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/actions/posts', () => ({ createPostAction: vi.fn() }))

// Radix Checkbox mirrors itself into a hidden form input it sizes with ResizeObserver, which
// jsdom does not implement.
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

const typeInto = async (title: string, body: string) => {
  await userEvent.type(screen.getByLabelText(/Title/), title)
  await userEvent.type(screen.getByLabelText(/Body/), body)
}

describe('PostNewView', () => {
  afterEach(() => vi.clearAllMocks())

  it('creates a draft and opens it', async () => {
    vi.mocked(createPostAction).mockResolvedValue({
      ok: true,
      data: { id: 7, published: false } as never,
    })
    render(<PostNewView />)
    expect(screen.getByRole('heading', { name: 'Write a post' })).toBeInTheDocument()
    await typeInto('Hello', 'Text')
    await userEvent.click(screen.getByRole('button', { name: 'Create post' }))
    expect(createPostAction).toHaveBeenCalledWith({
      title: 'Hello',
      body: 'Text',
      published: false,
    })
    expect(toast.success).toHaveBeenCalledWith('Draft saved')
    expect(push).toHaveBeenCalledWith('/posts/7')
  })

  it('publishes right away when the checkbox is ticked', async () => {
    vi.mocked(createPostAction).mockResolvedValue({
      ok: true,
      data: { id: 8, published: true } as never,
    })
    render(<PostNewView />)
    await typeInto('Hello', 'Text')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Published' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create post' }))
    expect(createPostAction).toHaveBeenCalledWith({ title: 'Hello', body: 'Text', published: true })
    expect(toast.success).toHaveBeenCalledWith('Post published')
    expect(push).toHaveBeenCalledWith('/posts/8')
  })

  it('shows the server error and stays on the page when the action fails', async () => {
    vi.mocked(createPostAction).mockResolvedValue({
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Try again in a minute.',
    })
    render(<PostNewView />)
    await typeInto('Title', 'Body')
    await userEvent.click(screen.getByRole('button', { name: 'Create post' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts')
    expect(toast.success).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('puts server field errors on the fields', async () => {
    vi.mocked(createPostAction).mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      message: 'Validation failed',
      fieldErrors: { title: ['Title is taken'] },
    })
    render(<PostNewView />)
    await typeInto('Title', 'Body')
    await userEvent.click(screen.getByRole('button', { name: 'Create post' }))
    expect(await screen.findByText('Title is taken')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('goes back to the posts page on cancel', async () => {
    render(<PostNewView />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(push).toHaveBeenCalledWith('/posts')
    expect(createPostAction).not.toHaveBeenCalled()
  })
})
