import { render, screen } from '@testing-library/react'
import { Trash2 } from 'lucide-react'
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

  it('shows its icon, and a spinner in its place while loading', () => {
    const { rerender } = render(<LoadingButton icon={Trash2}>Delete</LoadingButton>)
    expect(document.querySelector('svg.lucide-trash-2')).not.toBeNull()
    expect(document.querySelector('[data-slot="spinner"]')).toBeNull()

    rerender(
      <LoadingButton icon={Trash2} loading>
        Delete
      </LoadingButton>,
    )
    expect(document.querySelector('svg.lucide-trash-2')).toBeNull()
    expect(document.querySelector('[data-slot="spinner"]')).not.toBeNull()
  })
})
