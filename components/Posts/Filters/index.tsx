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
import { Button } from '@/components/SCN/button'
import {
  POST_SEARCH_MAX_LENGTH,
  hasActivePostFilters,
  postStatusSchema,
  postsSortSchema,
  type PostStatus,
  type PostsSort,
  type TagSummary,
} from '@/lib/dto/posts'
import styles from './styles.module.scss'

const SEARCH_DEBOUNCE_MS = 300

/** Select items cannot have an empty value, so "no filter" is this word in the control. */
const ALL = 'all'

export type PostsFiltersPatch = {
  q?: string
  sort?: PostsSort
  status?: PostStatus | ''
  tag?: string
  from?: string
  to?: string
}

type PostsFiltersProps = {
  q: string
  sort: PostsSort
  tag: string
  from: string
  to: string
  /** Tags to offer, with their published-post counts. */
  tags: TagSummary[]
  /** The status filter; the status select appears only when this is passed (`/posts/mine`). */
  status?: PostStatus | ''
  onChange: (patch: PostsFiltersPatch) => void
  disabled?: boolean
}

export const PostsFilters = ({
  q,
  sort,
  tag,
  from,
  to,
  tags,
  status,
  onChange,
  disabled,
}: PostsFiltersProps) => {
  const sortId = useId()
  const tagId = useId()
  const statusId = useId()
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

  const handleSort = (value: string) => {
    const parsed = postsSortSchema.safeParse(value)
    if (parsed.success) {
      onChange({ sort: parsed.data })
    }
  }

  const handleTag = (value: string) => {
    onChange({ tag: value === ALL ? '' : value })
  }

  const handleStatus = (value: string) => {
    if (value === ALL) {
      onChange({ status: '' })
      return
    }
    const parsed = postStatusSchema.safeParse(value)
    if (parsed.success) {
      onChange({ status: parsed.data })
    }
  }

  const handleClear = () => {
    // Drop a search that is still waiting for its debounce, then clear the box with the rest.
    clearTimeout(timer.current)
    setText('')
    setReported('')
    onChange({ q: '', tag: '', from: '', to: '', ...(status === undefined ? {} : { status: '' }) })
  }

  // A tag in the URL that no published post uses any more still has to show as selected.
  const tagOptions =
    tag && !tags.some((item) => item.name === tag) ? [...tags, { name: tag, postCount: 0 }] : tags
  const filtering = hasActivePostFilters({ q, status: status ?? '', tag, from, to })

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
      <div className={styles.control}>
        <Label htmlFor={tagId}>Tag</Label>
        <Select value={tag || ALL} onValueChange={handleTag} disabled={disabled}>
          <SelectTrigger id={tagId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All tags</SelectItem>
            {tagOptions.map((item) => (
              <SelectItem key={item.name} value={item.name}>
                {item.name} ({item.postCount})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {status !== undefined && (
        <div className={styles.control}>
          <Label htmlFor={statusId}>Status</Label>
          <Select value={status || ALL} onValueChange={handleStatus} disabled={disabled}>
            <SelectTrigger id={statusId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <div className={styles.date}>
        <Input
          type="date"
          label="From"
          value={from}
          max={to || undefined}
          disabled={disabled}
          onChange={(event) => onChange({ from: event.target.value })}
        />
      </div>
      <div className={styles.date}>
        <Input
          type="date"
          label="To"
          value={to}
          min={from || undefined}
          disabled={disabled}
          onChange={(event) => onChange({ to: event.target.value })}
        />
      </div>
      <div className={styles.control}>
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
      {filtering && (
        <Button type="button" variant="ghost" onClick={handleClear} disabled={disabled}>
          Clear filters
        </Button>
      )}
    </div>
  )
}
