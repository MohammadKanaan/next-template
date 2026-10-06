'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Input } from '@/components/Form/Input'
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

type PostsFiltersProps = {
  q: string
  sort: PostsSort
  onChange: (patch: { q?: string; sort?: PostsSort }) => void
  disabled?: boolean
}

export function PostsFilters({ q, sort, onChange, disabled }: PostsFiltersProps) {
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

  function handleSearch(value: string) {
    setText(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const next = value.trim()
      setReported(next)
      onChange({ q: next })
    }, SEARCH_DEBOUNCE_MS)
  }

  function handleSort(value: string) {
    const parsed = postsSortSchema.safeParse(value)
    if (parsed.success) {
      onChange({ sort: parsed.data })
    }
  }

  return (
    <div className={styles.filters}>
      <div className={styles.search}>
        <Input
          type="search"
          label="Search"
          placeholder="Search by title"
          value={text}
          maxLength={POST_SEARCH_MAX_LENGTH}
          disabled={disabled}
          onChange={(event) => handleSearch(event.target.value)}
        />
      </div>
      <div className={styles.sort}>
        <Label htmlFor={sortId}>Sort</Label>
        <Select value={sort} onValueChange={handleSort} disabled={disabled}>
          <SelectTrigger id={sortId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
