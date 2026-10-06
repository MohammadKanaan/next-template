import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPostAction } from '@/actions/posts'
import { PostNewView } from '@/app/(site)/posts/new/view'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/actions/posts', () => ({ createPostAction: vi.fn() }))

const KEY = 'post-draft:v1'

describe('PostNewView draft', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    vi.clearAllMocks()
  })

  const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

  it('saves what is typed and restores it on the next visit', async () => {
    const first = render(<PostNewView />)
    await setup().type(screen.getByLabelText(/Title/), 'Unfinished')
    act(() => vi.advanceTimersByTime(500))
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({
      title: 'Unfinished',
      body: '',
    })
    first.unmount()

    render(<PostNewView />)
    expect(screen.getByLabelText(/Title/)).toHaveValue('Unfinished')
  })

  it('clears the draft once the post is created', async () => {
    localStorage.setItem(KEY, JSON.stringify({ title: 'Saved', body: 'Text' }))
    vi.mocked(createPostAction).mockResolvedValue({
      ok: true,
      data: { id: 7, author: { id: 'u1' } } as never,
    })
    render(<PostNewView />)
    await setup().click(screen.getByRole('button', { name: 'Create post' }))
    expect(createPostAction).toHaveBeenCalledWith({ title: 'Saved', body: 'Text' })
    act(() => vi.advanceTimersByTime(1000))
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(push).toHaveBeenCalled()
  })

  it('removes the draft when the form is emptied', async () => {
    localStorage.setItem(KEY, JSON.stringify({ title: 'ab', body: '' }))
    render(<PostNewView />)
    await setup().clear(screen.getByLabelText(/Title/))
    act(() => vi.advanceTimersByTime(500))
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})
