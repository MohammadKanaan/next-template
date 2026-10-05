import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PostForm } from '@/components/Posts/Form'
import type { PostDetail } from '@/lib/dto/posts'

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
