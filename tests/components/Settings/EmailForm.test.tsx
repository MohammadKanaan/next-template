import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EmailForm } from '@/components/Settings/EmailForm'

describe('EmailForm', () => {
  it('validates the address before submitting', async () => {
    const onSubmit = vi.fn()
    render(<EmailForm onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/New email/), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Change email' }))
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the normalised address and clears the field on success', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: null })
    render(<EmailForm onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/New email/), 'New@Example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Change email' }))
    expect(onSubmit).toHaveBeenCalledWith({ newEmail: 'new@example.com' })
    expect(screen.getByLabelText(/New email/)).toHaveValue('')
  })

  it('keeps the field and shows the server error when it fails', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      message: 'Validation failed',
      fieldErrors: { newEmail: ['That is already your email address'] },
    })
    render(<EmailForm onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/New email/), 'me@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Change email' }))
    expect(await screen.findByText('That is already your email address')).toBeInTheDocument()
    expect(screen.getByLabelText(/New email/)).toHaveValue('me@example.com')
  })

  it('shows a form-level failure as an alert', async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ ok: false, code: 'VALIDATION', message: 'Could not change your email.' })
    render(<EmailForm onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/New email/), 'x@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Change email' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not change your email.')
  })
})
