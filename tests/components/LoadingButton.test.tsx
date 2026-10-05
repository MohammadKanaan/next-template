import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LoadingButton } from '@/components/LoadingButton'

describe('LoadingButton', () => {
  it('disables itself and reports busy while loading', () => {
    render(<LoadingButton loading>Save</LoadingButton>)
    const button = screen.getByRole('button', { name: /Save/ })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('is enabled and not busy by default', () => {
    render(<LoadingButton>Save</LoadingButton>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute('aria-busy')
  })
})
