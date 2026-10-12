'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Input } from '@/components/Form/Input'
import { Button } from '@/components/SCN/button'
import { Label } from '@/components/SCN/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/SCN/select'
import { POST_SEARCH_MAX_LENGTH, postsSortSchema, type PostsSort } from '@/lib/dto/posts'
import styles from './styles.module.scss'

const SEARCH_DEBOUNCE_MS = 300

/** The sort picker's options; also lets the trigger show the label instead of the value. */
const SORT_LABELS: Record<PostsSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
}

export type PostsFiltersPatch = {
  q?: string
  sort?: PostsSort
}

type PostsFiltersProps = {
  q: string
  sort: PostsSort
  onChange: (patch: PostsFiltersPatch) => void
  disabled?: boolean
}

/** A debounced title search and a sort order; the page decides where the values live (the URL). */
export const PostsFilters = ({ q, sort, onChange, disabled }: PostsFiltersProps) => {
  const sortId = useId()
  const [text, setText] = useState(q)
  // The last value this component reported, so the URL echoing it back is not mistaken for an
  // outside change (back/forward) that must overwrite what the user is still typing.
  const [reported, setReported] = useState(q)
  const [previousQ, setPreviousQ] = useState(q)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  if (q !== previousQ) {
    setPreviousQ(q)
    if (q !== reported) {
      setText(q)
      setReported(q)
    }
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  const handleSearch = (value: string) => {
    setText(value)
    clearTimeout(timer.current)
    // A keystroke that leaves the trimmed search as it is (a trailing space, or typing back to
    // what is already applied) is no change: reporting it would reset the page for nothing.
    if (value.trim() === reported) {
      return
    }
    timer.current = setTimeout(() => {
      const next = value.trim()
      setReported(next)
      onChange({ q: next })
    }, SEARCH_DEBOUNCE_MS)
  }

  const handleSort = (value: string | null) => {
    const parsed = postsSortSchema.safeParse(value)
    if (parsed.success) {
      onChange({ sort: parsed.data })
    }
  }

  const handleClear = () => {
    // Drop a search that is still waiting for its debounce, then clear the box.
    clearTimeout(timer.current)
    setText('')
    setReported('')
    onChange({ q: '' })
  }

  return (
    <div className={styles.filters}>
      <div className={styles.search}>
        <Input
          type="search"
          label="Search"
          placeholder="Search titles"
          value={text}
          maxLength={POST_SEARCH_MAX_LENGTH}
          disabled={disabled}
          onChange={(event) => handleSearch(event.target.value)}
        />
      </div>
      <div className={styles.control}>
        <Label htmlFor={sortId}>Sort</Label>
        <Select items={SORT_LABELS} value={sort} onValueChange={handleSort} disabled={disabled}>
          <SelectTrigger id={sortId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {postsSortSchema.options.map((option) => (
              <SelectItem key={option} value={option}>
                {SORT_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {q !== '' && (
        <Button type="button" variant="ghost" onClick={handleClear} disabled={disabled}>
          Clear search
        </Button>
      )}
    </div>
  )
}
