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

  describe('with real storage through the real form', () => {
    const typeInto = async (user: ReturnType<typeof setup>, title: string, body: string) => {
      await user.type(screen.getByLabelText(/Title/), title)
      await user.type(screen.getByLabelText(/Body/), body)
    }

    it('writes no draft after the post was created, however slow the navigation is', async () => {
      vi.mocked(createPostAction).mockResolvedValue({
        ok: true,
        data: { id: 7, author: { id: 'u1' } } as never,
      })
      render(<PostNewView />)
      const user = setup()
      await typeInto(user, 'Published', 'Text')
      act(() => vi.advanceTimersByTime(500))
      expect(localStorage.getItem(KEY)).not.toBeNull()

      await user.click(screen.getByRole('button', { name: 'Create post' }))
      expect(createPostAction).toHaveBeenCalledTimes(1)
      act(() => vi.advanceTimersByTime(2000))
      expect(localStorage.getItem(KEY)).toBeNull()
      // The form is still mounted (navigation is slow): typing more must not bring a draft back.
      await user.type(screen.getByLabelText(/Title/), '!')
      act(() => vi.advanceTimersByTime(2000))
      expect(localStorage.getItem(KEY)).toBeNull()
    })

    it('keeps the server error after a failed submit, even when the draft is written', async () => {
      vi.mocked(createPostAction).mockResolvedValue({
        ok: false,
        code: 'FORBIDDEN',
        message: 'You cannot post right now',
      })
      render(<PostNewView />)
      const user = setup()
      await typeInto(user, 'Title', 'Body')
      await user.click(screen.getByRole('button', { name: 'Create post' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('You cannot post right now')

      act(() => vi.advanceTimersByTime(2000))
      expect(screen.getByRole('alert')).toHaveTextContent('You cannot post right now')
      // What was typed is still kept for the next visit.
      expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({
        title: 'Title',
        body: 'Body',
      })
    })

    it('keeps a validation error on one field while the user types in another', async () => {
      render(<PostNewView />)
      const user = setup()
      await user.click(screen.getByRole('button', { name: 'Create post' }))
      expect(await screen.findByText('Title is required')).toBeInTheDocument()
      expect(screen.getByText('Body is required')).toBeInTheDocument()

      await user.type(screen.getByLabelText(/Body/), 'Some body')
      act(() => vi.advanceTimersByTime(2000))
      expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({
        title: '',
        body: 'Some body',
      })
      expect(screen.getByText('Title is required')).toBeInTheDocument()
      expect(screen.queryByText('Body is required')).not.toBeInTheDocument()
    })

    it('restores a stored draft once, then leaves the form to the user', async () => {
      localStorage.setItem(KEY, JSON.stringify({ title: 'Stored', body: 'Stored body' }))
      render(<PostNewView />)
      expect(screen.getByLabelText(/Title/)).toHaveValue('Stored')
      expect(screen.getByLabelText(/Body/)).toHaveValue('Stored body')
      const user = setup()
      await user.clear(screen.getByLabelText(/Title/))
      await user.type(screen.getByLabelText(/Title/), 'Mine')
      act(() => vi.advanceTimersByTime(500))
      expect(screen.getByLabelText(/Title/)).toHaveValue('Mine')
      expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({
        title: 'Mine',
        body: 'Stored body',
      })
    })
  })
})
