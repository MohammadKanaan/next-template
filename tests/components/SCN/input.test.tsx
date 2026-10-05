import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Input } from '@/components/SCN/input'

describe('Input', () => {
  it('associates its label and marks required fields', () => {
    render(<Input label="Title" required />)
    const input = screen.getByLabelText(/Title/)
    expect(input).toBeRequired()
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders an error and links it to the control', () => {
    render(<Input label="Title" error="Title is required" />)
    const input = screen.getByLabelText('Title')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Title is required')
  })

  it('lets callers override the ARIA fallbacks and keeps a caller id', () => {
    render(<Input label="Title" id="post-title" aria-invalid={false} error="Bad" />)
    const input = screen.getByLabelText('Title')
    expect(input).toHaveAttribute('id', 'post-title')
    expect(input).toHaveAttribute('aria-invalid', 'false')
  })
})
