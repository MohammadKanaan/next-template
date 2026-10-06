import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostsFilters } from '@/components/Posts/Filters'

// Radix Select measures and captures pointers, which jsdom does not implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

describe('PostsFilters', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('shows the current search and sort', () => {
    render(<PostsFilters q="cats" sort="oldest" onChange={() => {}} />)
    expect(screen.getByLabelText('Search')).toHaveValue('cats')
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Oldest first')
  })

  it('reports the search once, after the debounce, trimmed', () => {
    const onChange = vi.fn()
    render(<PostsFilters q="" sort="newest" onChange={onChange} />)
    const input = screen.getByLabelText('Search')
    fireEvent.change(input, { target: { value: 'c' } })
    fireEvent.change(input, { target: { value: 'cat ' } })
    act(() => vi.advanceTimersByTime(299))
    expect(onChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ q: 'cat' })
  })

  it('does not report after unmounting', () => {
    const onChange = vi.fn()
    const { unmount } = render(<PostsFilters q="" sort="newest" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'cat' } })
    unmount()
    act(() => vi.advanceTimersByTime(1000))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps what the user is typing when the URL echoes an earlier value back', () => {
    const onChange = vi.fn()
    const { rerender } = render(<PostsFilters q="" sort="newest" onChange={onChange} />)
    const input = screen.getByLabelText('Search')
    fireEvent.change(input, { target: { value: 'cat' } })
    act(() => vi.advanceTimersByTime(300))
    fireEvent.change(input, { target: { value: 'cats' } })
    rerender(<PostsFilters q="cat" sort="newest" onChange={onChange} />)
    expect(input).toHaveValue('cats')
  })

  it('follows a search that changed from outside (back/forward)', () => {
    const { rerender } = render(<PostsFilters q="cats" sort="newest" onChange={() => {}} />)
    rerender(<PostsFilters q="dogs" sort="newest" onChange={() => {}} />)
    expect(screen.getByLabelText('Search')).toHaveValue('dogs')
  })

  it('reports a sort change at once', async () => {
    vi.useRealTimers()
    const onChange = vi.fn()
    render(<PostsFilters q="" sort="newest" onChange={onChange} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Sort' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Oldest first' }))
    expect(onChange).toHaveBeenCalledWith({ sort: 'oldest' })
  })

  it('disables both controls', () => {
    render(<PostsFilters q="" sort="newest" onChange={() => {}} disabled />)
    expect(screen.getByLabelText('Search')).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeDisabled()
  })
})
