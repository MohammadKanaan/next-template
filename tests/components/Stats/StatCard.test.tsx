import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatCard } from '@/components/Stats/StatCard'

describe('StatCard', () => {
  it('shows the label and the value', () => {
    render(<StatCard label="Published" value={12} />)
    expect(screen.getByText('Published')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('shows a zero rather than hiding it', () => {
    render(<StatCard label="Drafts" value={0} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('shows the hint only when given', () => {
    const { rerender } = render(<StatCard label="Comments" value={3} hint="On published posts" />)
    expect(screen.getByText('On published posts')).toBeInTheDocument()
    rerender(<StatCard label="Comments" value={3} />)
    expect(screen.queryByText('On published posts')).not.toBeInTheDocument()
  })
})
