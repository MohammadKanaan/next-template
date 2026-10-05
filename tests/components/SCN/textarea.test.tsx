import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Textarea } from '@/components/SCN/textarea'

describe('Textarea', () => {
  it('associates its label and marks required fields', () => {
    render(<Textarea label="Body" required />)
    const textarea = screen.getByLabelText(/Body/)
    expect(textarea).toBeRequired()
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders an error and links it to the control', () => {
    render(<Textarea label="Body" error="Body is required" />)
    const textarea = screen.getByLabelText('Body')
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
    expect(textarea).toHaveAccessibleDescription('Body is required')
  })

  it('lets callers override the ARIA fallbacks and keeps a caller id', () => {
    render(<Textarea label="Body" id="post-body" aria-invalid={false} error="Bad" />)
    const textarea = screen.getByLabelText('Body')
    expect(textarea).toHaveAttribute('id', 'post-body')
    expect(textarea).toHaveAttribute('aria-invalid', 'false')
  })
})
