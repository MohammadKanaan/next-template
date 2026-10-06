import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TagsInput } from '@/components/Form/TagsInput'

type HarnessProps = {
  initial?: string[]
  onChange?: (value: string[]) => void
  error?: string
  maxTags?: number
  normalize?: (raw: string) => string
}

/** TagsInput is controlled; this holds the value the way a form would. */
const Harness = ({ initial = [], onChange, error, maxTags, normalize }: HarnessProps) => {
  const [value, setValue] = useState(initial)
  return (
    <TagsInput
      label="Tags"
      value={value}
      error={error}
      maxTags={maxTags}
      normalize={normalize}
      onChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
    />
  )
}

describe('TagsInput', () => {
  it('labels the control and shows an error', () => {
    render(<Harness error="Use at most 5 tags" />)
    const input = screen.getByLabelText('Tags')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Use at most 5 tags')).toBeInTheDocument()
    expect(input).toHaveAccessibleDescription('Use at most 5 tags')
  })

  it('adds a tag on Enter without submitting the surrounding form', async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())
    const onChange = vi.fn()
    render(
      <form onSubmit={onSubmit}>
        <Harness onChange={onChange} />
      </form>,
    )
    await userEvent.type(screen.getByLabelText('Tags'), 'news{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['news'])
    expect(screen.getByText('news')).toBeInTheDocument()
    expect(screen.getByLabelText('Tags')).toHaveValue('')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('adds tags on comma, including a pasted list', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Tags'), 'a,')
    expect(onChange).toHaveBeenLastCalledWith(['a'])
    await userEvent.click(screen.getByLabelText('Tags'))
    await userEvent.paste('b, c ,,d')
    expect(onChange).toHaveBeenLastCalledWith(['a', 'b', 'c', 'd'])
  })

  it('adds what is typed when the field loses focus', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Tags'), 'draft')
    await userEvent.tab()
    expect(onChange).toHaveBeenLastCalledWith(['draft'])
  })

  it('ignores empty and duplicate tags', async () => {
    const onChange = vi.fn()
    render(<Harness initial={['news']} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Tags'), '   {Enter}news{Enter}')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('normalizes with the given function', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} normalize={(raw) => raw.trim().toLowerCase()} />)
    await userEvent.type(screen.getByLabelText('Tags'), 'TypeScript{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['typescript'])
  })

  it('removes a tag with its button and the last one with Backspace', async () => {
    const onChange = vi.fn()
    render(<Harness initial={['a', 'b', 'c']} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove tag b' }))
    expect(onChange).toHaveBeenLastCalledWith(['a', 'c'])
    await userEvent.type(screen.getByLabelText('Tags'), '{Backspace}')
    expect(onChange).toHaveBeenLastCalledWith(['a'])
  })

  it('does not remove a tag on Backspace while text is being edited', async () => {
    const onChange = vi.fn()
    render(<Harness initial={['a']} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Tags'), 'xy{Backspace}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('stops accepting tags at the maximum', async () => {
    const onChange = vi.fn()
    render(<Harness initial={['a']} maxTags={2} onChange={onChange} />)
    expect(screen.getByText('1 of 2 tags. Press Enter or comma to add one.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Tags'), 'b{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['a', 'b'])
    expect(screen.getByLabelText('Tags')).toBeDisabled()
    expect(screen.getByText('2 of 2 tags. Press Enter or comma to add one.')).toBeInTheDocument()
  })
})
