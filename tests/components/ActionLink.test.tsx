import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ActionLink } from '@/components/ActionLink'

describe('ActionLink', () => {
  it('is an icon link named by its label', () => {
    render(<ActionLink action="view" label="View Dune" href="/movies/dune-2021" />)
    const link = screen.getByRole('link', { name: 'View Dune' })
    expect(link).toHaveAttribute('href', '/movies/dune-2021')
    expect(link.querySelector('svg')).not.toBeNull()
  })
})
