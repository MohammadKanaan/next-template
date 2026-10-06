import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostForm } from '@/components/Posts/Form'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { postDraftSchema, type PostDetail, type PostDraft } from '@/lib/dto/posts'

const success = { ok: true, data: null }
const post: PostDetail = {
  id: 1,
  title: 'Hello',
  body: 'World',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  author: { id: 'u1', name: 'Leanne Graham', username: 'leanne', website: null },
  permissions: { update: true, delete: true },
}

describe('PostForm', () => {
  it('shows field errors and does not submit invalid values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(success)
    render(<PostForm post={null} submitLabel="Create post" onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create post' }))
    expect(await screen.findByText('Title is required')).toBeInTheDocument()
    expect(screen.getByText('Body is required')).toBeInTheDocument()
    expect(screen.getByLabelText(/Title/)).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits trimmed values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(success)
    render(<PostForm post={null} submitLabel="Create post" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Title/), '  Hello  ')
    await userEvent.type(screen.getByLabelText(/Body/), 'World')
    await userEvent.click(screen.getByRole('button', { name: 'Create post' }))
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Hello', body: 'World' })
  })

  it('maps server validation errors onto fields', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      message: 'Validation failed',
      fieldErrors: { title: ['Title is taken'] },
    })
    render(<PostForm post={null} submitLabel="Create post" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Title/), 'Hello')
    await userEvent.type(screen.getByLabelText(/Body/), 'World')
    await userEvent.click(screen.getByRole('button', { name: 'Create post' }))
    expect(await screen.findByText('Title is taken')).toBeInTheDocument()
  })

  it('shows a form-level error when the server gives no field errors', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      code: 'FORBIDDEN',
      message: 'You cannot change this post',
    })
    render(<PostForm post={post} submitLabel="Save" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Body/), '!')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You cannot change this post')
  })

  it('keeps Save disabled until an existing post is changed', async () => {
    render(<PostForm post={post} submitLabel="Save" onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/Title/), '!')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })
})

describe('PostForm draft', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

  it('seeds a new post from the draft', () => {
    render(
      <PostForm
        post={null}
        draft={{ title: 'Saved title', body: 'Saved body' }}
        submitLabel="Create post"
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/Title/)).toHaveValue('Saved title')
    expect(screen.getByLabelText(/Body/)).toHaveValue('Saved body')
  })

  it('ignores the draft when editing an existing post', () => {
    render(
      <PostForm
        post={post}
        draft={{ title: 'Saved title', body: 'Saved body' }}
        submitLabel="Save"
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/Title/)).toHaveValue('Hello')
  })

  it('reports the draft once, after typing pauses', async () => {
    const onDraftChange = vi.fn()
    render(
      <PostForm
        post={null}
        submitLabel="Create post"
        onSubmit={vi.fn()}
        onDraftChange={onDraftChange}
      />,
    )
    await setup().type(screen.getByLabelText(/Title/), 'Hey')
    expect(onDraftChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(500))
    expect(onDraftChange).toHaveBeenCalledTimes(1)
    expect(onDraftChange).toHaveBeenCalledWith({ title: 'Hey', body: '' })
  })

  it('reports null when the form is emptied again', async () => {
    const onDraftChange = vi.fn()
    render(
      <PostForm
        post={null}
        draft={{ title: 'ab', body: '' }}
        submitLabel="Create post"
        onSubmit={vi.fn()}
        onDraftChange={onDraftChange}
      />,
    )
    await setup().clear(screen.getByLabelText(/Title/))
    act(() => vi.advanceTimersByTime(500))
    expect(onDraftChange).toHaveBeenLastCalledWith(null)
  })

  it('does not report drafts for an edit form that passes no handler', async () => {
    render(<PostForm post={post} submitLabel="Save" onSubmit={vi.fn()} />)
    await setup().type(screen.getByLabelText(/Title/), '!')
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByLabelText(/Title/)).toHaveValue('Hello!')
  })

  it('does not write a pending draft after a successful submit', async () => {
    const onDraftChange = vi.fn()
    const onSubmit = vi.fn().mockResolvedValue(success)
    render(
      <PostForm
        post={null}
        submitLabel="Create post"
        onSubmit={onSubmit}
        onDraftChange={onDraftChange}
      />,
    )
    const user = setup()
    await user.type(screen.getByLabelText(/Title/), 'Hello')
    await user.type(screen.getByLabelText(/Body/), 'World')
    await user.click(screen.getByRole('button', { name: 'Create post' }))
    act(() => vi.advanceTimersByTime(1000))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onDraftChange).not.toHaveBeenCalled()
  })

  it('keeps the draft when the submit fails', async () => {
    const onDraftChange = vi.fn()
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      code: 'FORBIDDEN',
      message: 'Nope',
    })
    render(
      <PostForm
        post={null}
        submitLabel="Create post"
        onSubmit={onSubmit}
        onDraftChange={onDraftChange}
      />,
    )
    const user = setup()
    await user.type(screen.getByLabelText(/Title/), 'Hello')
    await user.type(screen.getByLabelText(/Body/), 'World')
    await user.click(screen.getByRole('button', { name: 'Create post' }))
    expect(onDraftChange).toHaveBeenLastCalledWith({ title: 'Hello', body: 'World' })
  })

  it('never resets what is being typed while the draft is written back into the form', async () => {
    function Harness() {
      const { value, setValue, removeValue } = useLocalStorage('post-draft:test', postDraftSchema)
      return (
        <PostForm
          post={null}
          draft={value}
          submitLabel="Create post"
          onSubmit={vi.fn()}
          onDraftChange={(next: PostDraft | null) => (next ? setValue(next) : removeValue())}
        />
      )
    }
    render(<Harness />)
    const user = setup()
    const title = screen.getByLabelText(/Title/)
    await user.type(title, 'First')
    act(() => vi.advanceTimersByTime(500))
    expect(JSON.parse(localStorage.getItem('post-draft:test') ?? 'null')).toEqual({
      title: 'First',
      body: '',
    })
    // The saved draft flowed back into `values`; typing carries on from where it was.
    expect(title).toHaveValue('First')
    await user.type(title, ' draft')
    expect(title).toHaveValue('First draft')
    await user.type(screen.getByLabelText(/Body/), 'Body text')
    act(() => vi.advanceTimersByTime(500))
    expect(title).toHaveValue('First draft')
    expect(screen.getByLabelText(/Body/)).toHaveValue('Body text')
    expect(JSON.parse(localStorage.getItem('post-draft:test') ?? 'null')).toEqual({
      title: 'First draft',
      body: 'Body text',
    })
  })

  it('keeps typed fields but adopts a draft saved elsewhere for untouched ones', async () => {
    function Harness() {
      const { value } = useLocalStorage('post-draft:test', postDraftSchema)
      return (
        <PostForm
          post={null}
          draft={value}
          submitLabel="Create"
          onSubmit={vi.fn()}
          onDraftChange={() => {}}
        />
      )
    }
    render(<Harness />)
    await setup().type(screen.getByLabelText(/Title/), 'Mine')
    act(() => {
      localStorage.setItem(
        'post-draft:test',
        JSON.stringify({ title: 'Other tab', body: 'Remote body' }),
      )
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'post-draft:test', storageArea: localStorage }),
      )
    })
    expect(screen.getByLabelText(/Title/)).toHaveValue('Mine')
    expect(screen.getByLabelText(/Body/)).toHaveValue('Remote body')
  })

  it('restores a draft that was already in storage when the form mounts', () => {
    localStorage.setItem('post-draft:test', JSON.stringify({ title: 'Back again', body: 'Text' }))
    function Harness() {
      const { value } = useLocalStorage('post-draft:test', postDraftSchema)
      return <PostForm post={null} draft={value} submitLabel="Create" onSubmit={vi.fn()} />
    }
    render(<Harness />)
    expect(screen.getByLabelText(/Title/)).toHaveValue('Back again')
    expect(screen.getByLabelText(/Body/)).toHaveValue('Text')
  })
})
