import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatCard } from '@/components/Admin/StatCard'

describe('StatCard', () => {
  it('formats large values with separators and links the whole card when given a target', () => {
    render(<StatCard label="People" value={12345} href="/admin/people" />)
    expect(screen.getByText('12,345')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /People/ })).toHaveAttribute('href', '/admin/people')
  })

  it('is a plain block without a target', () => {
    render(<StatCard label="Banned" value={0} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
