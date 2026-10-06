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
  return (
    <PostsFilters
      q=""
      sort="newest"
      tag=""
      from=""
      to=""
      tags={[]}
      onChange={() => {}}
      {...props}
    />
  )
}

describe('PostsFilters', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('shows the current search and sort', () => {
    render(<Filters q="cats" sort="oldest" onChange={() => {}} />)
    expect(screen.getByLabelText('Search')).toHaveValue('cats')
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Oldest first')
  })

  it('reports the search once, after the debounce, trimmed', () => {
    const onChange = vi.fn()
    render(<Filters q="" sort="newest" onChange={onChange} />)
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
    render(<Filters q="cat" sort="newest" onChange={onChange} />)
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
    render(<Filters q="" sort="newest" onChange={onChange} />)
    const input = screen.getByLabelText('Search')
    fireEvent.change(input, { target: { value: 'cat' } })
    act(() => vi.advanceTimersByTime(300))
    fireEvent.change(input, { target: { value: 'cat ' } })
    act(() => vi.advanceTimersByTime(300))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('does not report after unmounting', () => {
    const onChange = vi.fn()
    const { unmount } = render(<Filters q="" sort="newest" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'cat' } })
    unmount()
    act(() => vi.advanceTimersByTime(1000))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps what the user is typing when the URL echoes an earlier value back', () => {
    const onChange = vi.fn()
    const { rerender } = render(<Filters q="" sort="newest" onChange={onChange} />)
    const input = screen.getByLabelText('Search')
    fireEvent.change(input, { target: { value: 'cat' } })
    act(() => vi.advanceTimersByTime(300))
    fireEvent.change(input, { target: { value: 'cats' } })
    rerender(<Filters q="cat" sort="newest" onChange={onChange} />)
    expect(input).toHaveValue('cats')
  })

  it('follows a search that changed from outside (back/forward)', () => {
    const { rerender } = render(<Filters q="cats" sort="newest" onChange={() => {}} />)
    rerender(<Filters q="dogs" sort="newest" onChange={() => {}} />)
    expect(screen.getByLabelText('Search')).toHaveValue('dogs')
  })

  it('reports a sort change at once', async () => {
    vi.useRealTimers()
    const onChange = vi.fn()
    render(<Filters q="" sort="newest" onChange={onChange} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Sort' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Oldest first' }))
    expect(onChange).toHaveBeenCalledWith({ sort: 'oldest' })
  })

  it('disables both controls', () => {
    render(<Filters q="" sort="newest" onChange={() => {}} disabled />)
    expect(screen.getByLabelText('Search')).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeDisabled()
  })

  describe('tag, status and dates', () => {
    const tags = [
      { name: 'news', postCount: 3 },
      { name: 'tips', postCount: 1 },
    ]

    it('offers the tags with their counts and reports the chosen one', async () => {
      vi.useRealTimers()
      const onChange = vi.fn()
      render(<Filters tags={tags} onChange={onChange} />)
      expect(screen.getByRole('combobox', { name: 'Tag' })).toHaveTextContent('All tags')
      await userEvent.click(screen.getByRole('combobox', { name: 'Tag' }))
      await userEvent.click(await screen.findByRole('option', { name: 'tips (1)' }))
      expect(onChange).toHaveBeenCalledWith({ tag: 'tips' })
    })

    it('reports "All tags" as an empty tag', async () => {
      vi.useRealTimers()
      const onChange = vi.fn()
      render(<Filters tags={tags} tag="news" onChange={onChange} />)
      await userEvent.click(screen.getByRole('combobox', { name: 'Tag' }))
      await userEvent.click(await screen.findByRole('option', { name: 'All tags' }))
      expect(onChange).toHaveBeenCalledWith({ tag: '' })
    })

    it('treats a tag named "all" as that tag, not as "All tags"', async () => {
      vi.useRealTimers()
      const onChange = vi.fn()
      render(<Filters tags={[{ name: 'all', postCount: 2 }]} onChange={onChange} />)
      await userEvent.click(screen.getByRole('combobox', { name: 'Tag' }))
      await userEvent.click(await screen.findByRole('option', { name: 'all (2)' }))
      expect(onChange).toHaveBeenCalledWith({ tag: 'all' })
    })

    it('still shows a selected tag named "all" as selected', () => {
      render(<Filters tags={[{ name: 'all', postCount: 2 }]} tag="all" />)
      expect(screen.getByRole('combobox', { name: 'Tag' })).toHaveTextContent('all (2)')
    })

    it('still shows a selected tag that no published post uses', () => {
      render(<Filters tags={tags} tag="gone" />)
      expect(screen.getByRole('combobox', { name: 'Tag' })).toHaveTextContent('gone (0)')
    })

    it('shows the status select only when a status is passed', async () => {
      vi.useRealTimers()
      const { rerender } = render(<Filters />)
      expect(screen.queryByRole('combobox', { name: 'Status' })).not.toBeInTheDocument()

      const onChange = vi.fn()
      rerender(<Filters status="" onChange={onChange} />)
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('All statuses')
      await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
      await userEvent.click(await screen.findByRole('option', { name: 'Draft' }))
      expect(onChange).toHaveBeenCalledWith({ status: 'draft' })
    })

    it('reports each date as soon as it changes, and an emptied one as empty', () => {
      const onChange = vi.fn()
      render(<Filters from="2026-10-01" onChange={onChange} />)
      expect(screen.getByLabelText('From')).toHaveAttribute('type', 'date')
      fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-05' } })
      expect(onChange).toHaveBeenLastCalledWith({ to: '2026-10-05' })
      fireEvent.change(screen.getByLabelText('From'), { target: { value: '' } })
      expect(onChange).toHaveBeenLastCalledWith({ from: '' })
    })

    it('limits each date by the other', () => {
      render(<Filters from="2026-10-01" to="2026-10-09" />)
      expect(screen.getByLabelText('From')).toHaveAttribute('max', '2026-10-09')
      expect(screen.getByLabelText('To')).toHaveAttribute('min', '2026-10-01')
    })
  })

  describe('clear filters', () => {
    it('is hidden while nothing is filtered, and sort alone is not a filter', () => {
      render(<Filters sort="oldest" />)
      expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    })

    it('resets every filter at once and empties the search box', async () => {
      vi.useRealTimers()
      const onChange = vi.fn()
      render(<Filters q="cats" tag="news" from="2026-10-01" to="2026-10-05" onChange={onChange} />)
      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
      expect(onChange).toHaveBeenCalledWith({ q: '', tag: '', from: '', to: '' })
      expect(screen.getByLabelText('Search')).toHaveValue('')
    })

    it('also clears the status where there is a status select', async () => {
      vi.useRealTimers()
      const onChange = vi.fn()
      render(<Filters status="draft" onChange={onChange} />)
      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
      expect(onChange).toHaveBeenCalledWith({ q: '', tag: '', from: '', to: '', status: '' })
    })

    it('drops a search that is still waiting for its debounce', () => {
      const onChange = vi.fn()
      render(<Filters tag="news" onChange={onChange} />)
      fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'cat' } })
      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
      act(() => vi.advanceTimersByTime(1000))
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('is disabled with the other controls', () => {
      render(<Filters tag="news" disabled />)
      expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDisabled()
    })
  })
})
