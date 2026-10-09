import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { PostForm } from '@/components/Posts/Form'
import type { PostDetail } from '@/lib/dto/posts'

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

const success = { ok: true, data: null }
const post: PostDetail = {
  id: 1,
  title: 'Hello',
  body: 'World',
  published: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  author: { id: 'u1', name: 'Leanne Graham', username: 'leanne', website: null },
  permissions: { update: true, delete: true },
}

const published = () => screen.getByRole('checkbox', { name: 'Published' })

describe('PostForm', () => {
  it('shows field errors and does not submit invalid values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(success)
    render(<PostForm post={null} submitLabel="Create post" onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create post' }))
    expect(await screen.findByText('Title is required')).toBeInTheDocument()
    expect(screen.getByText('Body is required')).toBeInTheDocument()
    expect(screen.getByLabelText(/Title/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/Body/)).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits trimmed values, as a draft by default', async () => {
    const onSubmit = vi.fn().mockResolvedValue(success)
    render(<PostForm post={null} submitLabel="Create post" onSubmit={onSubmit} />)
    expect(published()).not.toBeChecked()
    await userEvent.type(screen.getByLabelText(/Title/), '  Hello  ')
    await userEvent.type(screen.getByLabelText(/Body/), 'World')
    await userEvent.click(screen.getByRole('button', { name: 'Create post' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Hello', body: 'World', published: false })
  })

  it('submits published when the checkbox is ticked', async () => {
    const onSubmit = vi.fn().mockResolvedValue(success)
    render(<PostForm post={null} submitLabel="Create post" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Title/), 'Hello')
    await userEvent.type(screen.getByLabelText(/Body/), 'World')
    await userEvent.click(published())
    expect(published()).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Create post' }))
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Hello', body: 'World', published: true })
  })

  it('explains what a draft is', () => {
    render(<PostForm post={null} submitLabel="Create post" onSubmit={vi.fn()} />)
    expect(screen.getByText('A draft is visible to you and admins only.')).toBeInTheDocument()
  })

  it('shows the fields of an existing post', () => {
    render(<PostForm post={{ ...post, published: true }} submitLabel="Save" onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(/Title/)).toHaveValue('Hello')
    expect(screen.getByLabelText(/Body/)).toHaveValue('World')
    expect(published()).toBeChecked()
  })

  it('submits the whole form of an existing post, including an unchanged field', async () => {
    const onSubmit = vi.fn().mockResolvedValue(success)
    render(<PostForm post={post} submitLabel="Save" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Body/), '!')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Hello', body: 'World!', published: false })
  })

  it('keeps Save disabled until an existing post is changed', async () => {
    render(<PostForm post={post} submitLabel="Save" onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/Title/), '!')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('counts a change of the published flag as a change', async () => {
    render(<PostForm post={post} submitLabel="Save" onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.click(published())
    expect(published()).toBeChecked()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    await userEvent.click(published())
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('lets a new post be submitted right away', () => {
    render(<PostForm post={null} submitLabel="Create post" onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Create post' })).toBeEnabled()
  })

  it('maps server validation errors onto fields', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      message: 'Validation failed',
      fieldErrors: { title: ['Title is taken'], body: ['Body is too plain'] },
    })
    render(<PostForm post={null} submitLabel="Create post" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Title/), 'Hello')
    await userEvent.type(screen.getByLabelText(/Body/), 'World')
    await userEvent.click(screen.getByRole('button', { name: 'Create post' }))
    expect(await screen.findByText('Title is taken')).toBeInTheDocument()
    expect(screen.getByText('Body is too plain')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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

  it('shows no error after a successful submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(success)
    render(<PostForm post={post} submitLabel="Save" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Body/), '!')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('follows the post it edits when a save refreshes it', () => {
    const { rerender } = render(<PostForm post={post} submitLabel="Save" onSubmit={vi.fn()} />)
    rerender(
      <PostForm
        post={{ ...post, title: 'Saved title', published: true }}
        submitLabel="Save"
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/Title/)).toHaveValue('Saved title')
    expect(published()).toBeChecked()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('offers Cancel only when asked, and calls back without submitting', async () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    const { rerender } = render(
      <PostForm post={null} submitLabel="Create post" onSubmit={onSubmit} />,
    )
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    rerender(
      <PostForm post={null} submitLabel="Create post" onSubmit={onSubmit} onCancel={onCancel} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
