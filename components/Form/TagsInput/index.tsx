'use client'

import { X } from 'lucide-react'
import { useId, useState, type ChangeEvent, type KeyboardEvent, type Ref } from 'react'
import { Badge } from '@/components/SCN/badge'
import { Input as ShadcnInput } from '@/components/SCN/input'
import { Label } from '@/components/SCN/label'
import styles from './styles.module.scss'

type TagsInputProps = {
  label?: string
  error?: string
  required?: boolean
  /** The tags as chips; the parent owns them (controlled), e.g. through a `Controller`. */
  value: string[]
  onChange: (value: string[]) => void
  onBlur?: () => void
  /** Turns what was typed into a tag; an empty result is dropped. Defaults to trimming. */
  normalize?: (raw: string) => string
  maxTags?: number
  /** The longest a single tag may be; a pasted list is split first, so it is not cut short. */
  maxLength?: number
  placeholder?: string
  disabled?: boolean
  id?: string
  name?: string
  ref?: Ref<HTMLInputElement>
}

const trimTag = (raw: string) => raw.trim()

export const TagsInput = ({
  label,
  error,
  required,
  value,
  onChange,
  onBlur,
  normalize = trimTag,
  maxTags,
  maxLength,
  placeholder = 'Type a tag and press Enter',
  disabled,
  id,
  name,
  ref,
}: TagsInputProps) => {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`
  const [draft, setDraft] = useState('')
  const isFull = maxTags !== undefined && value.length >= maxTags

  /** Adds every comma-separated part of `raw` that is new, until `maxTags` is reached. */
  const commit = (raw: string) => {
    const next = [...value]
    for (const part of raw.split(',')) {
      const tag = normalize(part).slice(0, maxLength)
      if (tag && !next.includes(tag) && (maxTags === undefined || next.length < maxTags)) {
        next.push(tag)
      }
    }
    if (next.length !== value.length) {
      onChange(next)
    }
    setDraft('')
  }

  const remove = (tag: string) => onChange(value.filter((item) => item !== tag))

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value
    if (text.includes(',')) {
      commit(text)
      return
    }
    setDraft(text.slice(0, maxLength))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      // Enter adds the tag; it must not submit the surrounding form.
      event.preventDefault()
      commit(draft)
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      remove(value[value.length - 1])
    }
  }

  const handleBlur = () => {
    commit(draft)
    onBlur?.()
  }

  return (
    <div className={styles.field}>
      {label && (
        <Label htmlFor={inputId}>
          {label}
          {required && (
            <span className={styles.requiredMarker} aria-hidden="true">
              *
            </span>
          )}
        </Label>
      )}
      {value.length > 0 && (
        <ul className={styles.tags} aria-label={label ? `${label} added` : 'Tags added'}>
          {value.map((tag) => (
            <li key={tag}>
              <Badge variant="secondary">
                {tag}
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove tag ${tag}`}
                  disabled={disabled}
                  onClick={() => remove(tag)}
                >
                  <X aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <ShadcnInput
        ref={ref}
        id={inputId}
        name={name}
        value={draft}
        placeholder={isFull ? undefined : placeholder}
        disabled={disabled || isFull}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [error ? errorId : null, maxTags !== undefined ? hintId : null]
            .filter(Boolean)
            .join(' ') || undefined
        }
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      {maxTags !== undefined && (
        <p id={hintId} className={styles.hint}>
          {value.length} of {maxTags} tags. Press Enter or comma to add one.
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  )
}
