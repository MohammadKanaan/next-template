import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostsFilters } from '@/components/Posts/Filters'
import type { ComponentProps } from 'react'

// Radix Select measures and captures pointers, which jsdom does not implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

const Filters = (props: Partial<ComponentProps<typeof PostsFilters>>) => {
  return <PostsFilters q="" sort="newest" onChange={() => {}} {...props} />
}

describe('PostsFilters', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('shows the current search and sort', () => {
    render(<Filters q="cats" sort="oldest" />)
    expect(screen.getByLabelText('Search')).toHaveValue('cats')
    expect(screen.getByLabelText('Search')).toHaveAttribute('maxlength', '100')
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Oldest first')
  })

  it('shows newest first by default', () => {
    render(<Filters />)
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Newest first')
  })

  it('reports the search once, after the debounce, trimmed', () => {
    const onChange = vi.fn()
    render(<Filters onChange={onChange} />)
    const input = screen.getByLabelText('Search')
    fireEvent.change(input, { target: { value: 'c' } })
    fireEvent.change(input, { target: { value: 'cat ' } })
    act(() => vi.advanceTimersByTime(299))
    expect(onChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ q: 'cat' })
  })

  it('does not report a keystroke that leaves the trimmed search unchanged', () => {
    const onChange = vi.fn()
    render(<Filters q="cat" onChange={onChange} />)
    const input = screen.getByLabelText('Search')
    fireEvent.change(input, { target: { value: 'cat ' } })
    act(() => vi.advanceTimersByTime(1000))
    expect(onChange).not.toHaveBeenCalled()

    // Changing and then typing back before the debounce ends cancels the pending report too.
    fireEvent.change(input, { target: { value: 'cats' } })
    fireEvent.change(input, { target: { value: 'cat' } })
    act(() => vi.advanceTimersByTime(1000))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not report the same search twice', () => {
    const onChange = vi.fn()
    render(<Filters onChange={onChange} />)
    const input = screen.getByLabelText('Search')
    fireEvent.change(input, { target: { value: 'cat' } })
    act(() => vi.advanceTimersByTime(300))
    fireEvent.change(input, { target: { value: 'cat ' } })
    act(() => vi.advanceTimersByTime(300))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('reports an emptied search box', () => {
    const onChange = vi.fn()
    render(<Filters q="cat" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: '' } })
    act(() => vi.advanceTimersByTime(300))
    expect(onChange).toHaveBeenCalledWith({ q: '' })
  })

  it('does not report after unmounting', () => {
    const onChange = vi.fn()
    const { unmount } = render(<Filters onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'cat' } })
    unmount()
    act(() => vi.advanceTimersByTime(1000))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps what the user is typing when the URL echoes an earlier value back', () => {
    const onChange = vi.fn()
    const { rerender } = render(<Filters onChange={onChange} />)
    const input = screen.getByLabelText('Search')
    fireEvent.change(input, { target: { value: 'cat' } })
    act(() => vi.advanceTimersByTime(300))
    fireEvent.change(input, { target: { value: 'cats' } })
    rerender(<Filters q="cat" onChange={onChange} />)
    expect(input).toHaveValue('cats')
  })

  it('follows a search that changed from outside (back/forward)', () => {
    const { rerender } = render(<Filters q="cats" />)
    rerender(<Filters q="dogs" />)
    expect(screen.getByLabelText('Search')).toHaveValue('dogs')
    rerender(<Filters q="" />)
    expect(screen.getByLabelText('Search')).toHaveValue('')
  })

  it('reports a sort change at once', async () => {
    vi.useRealTimers()
    const onChange = vi.fn()
    render(<Filters onChange={onChange} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Sort' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Oldest first' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ sort: 'oldest' })
  })

  it('offers newest and oldest only', async () => {
    vi.useRealTimers()
    render(<Filters />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Sort' }))
    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['Newest first', 'Oldest first'])
  })

  it('disables both controls', () => {
    render(<Filters disabled />)
    expect(screen.getByLabelText('Search')).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeDisabled()
  })

  describe('clear search', () => {
    it('is hidden while no search is applied, and sort alone does not show it', () => {
      render(<Filters sort="oldest" />)
      expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
    })

    it('stays hidden while a search is typed but not yet applied', () => {
      render(<Filters />)
      fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'cat' } })
      expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
    })

    it('clears the applied search at once and empties the box', () => {
      const onChange = vi.fn()
      render(<Filters q="cats" onChange={onChange} />)
      fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith({ q: '' })
      expect(screen.getByLabelText('Search')).toHaveValue('')
    })

    it('drops a search that is still waiting for its debounce', () => {
      const onChange = vi.fn()
      render(<Filters q="cats" onChange={onChange} />)
      fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'dogs' } })
      fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
      act(() => vi.advanceTimersByTime(1000))
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith({ q: '' })
    })

    it('lets the user search again after clearing', () => {
      const onChange = vi.fn()
      const { rerender } = render(<Filters q="cats" onChange={onChange} />)
      fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
      rerender(<Filters q="" onChange={onChange} />)
      fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'cats' } })
      act(() => vi.advanceTimersByTime(300))
      expect(onChange).toHaveBeenLastCalledWith({ q: 'cats' })
    })

    it('is disabled with the other controls', () => {
      render(<Filters q="cats" disabled />)
      expect(screen.getByRole('button', { name: 'Clear search' })).toBeDisabled()
    })
  })
})
