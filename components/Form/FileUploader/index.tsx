'use client'

import { useId, useRef, useState, type ChangeEvent } from 'react'
import { LoadingButton } from '@/components/LoadingButton'
import { formatBytes } from '@/lib/formatBytes'
import styles from './styles.module.scss'

type FileState = {
  id: number
  name: string
  status: 'waiting' | 'uploading' | 'done' | 'error'
  message?: string
}

export type FileUploaderProps = {
  /** Accessible name of the file input, and the text of the button. */
  label: string
  /** The content types the picker offers and the uploader accepts. */
  accept: readonly string[]
  /** The largest file accepted, in bytes. */
  maxSize: number
  multiple?: boolean
  /**
   * The most files one pick uploads. Further acceptable files are refused with a message and never
   * sent, so a caller with a quota does not upload what the server would turn away.
   */
  maxFiles?: number
  disabled?: boolean
  /** Shown under the button (for example the allowed types and the size limit). */
  hint?: string
  /**
   * Uploads one file. Reject with an `Error` whose message is fit for people: it is shown beside
   * that file. Files are sent one after the other, so a rule like "at most 10" holds.
   */
  onUpload: (file: File) => Promise<void>
}

export const FileUploader = ({
  label,
  accept,
  maxSize,
  multiple = false,
  maxFiles,
  disabled = false,
  hint,
  onUpload,
}: FileUploaderProps) => {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const nextId = useRef(0)
  const [files, setFiles] = useState<FileState[]>([])
  const [busy, setBusy] = useState(false)

  const update = (id: number, change: Partial<FileState>) => {
    setFiles((current) => current.map((item) => (item.id === id ? { ...item, ...change } : item)))
  }

  const problem = (file: File) => {
    if (!accept.some((type) => type === file.type)) {
      return `${file.name} is not an allowed file type`
    }
    if (file.size < 1) {
      return `${file.name} is empty`
    }
    if (file.size > maxSize) {
      return `${file.name} is larger than ${formatBytes(maxSize)}`
    }
    return null
  }

  const uploadAll = async (picked: File[]) => {
    const entries = picked.map((file) => ({ file, id: (nextId.current += 1) }))
    setFiles(entries.map(({ file, id }) => ({ id, name: file.name, status: 'waiting' })))
    setBusy(true)
    let accepted = 0
    for (const { file, id } of entries) {
      const rejected = problem(file)
      if (rejected) {
        update(id, { status: 'error', message: rejected })
        continue
      }
      if (maxFiles !== undefined && accepted >= maxFiles) {
        update(id, { status: 'error', message: `${file.name} was not uploaded: no room left` })
        continue
      }
      accepted += 1
      update(id, { status: 'uploading' })
      try {
        await onUpload(file)
        update(id, { status: 'done' })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The upload failed. Try again.'
        update(id, { status: 'error', message })
      }
    }
    setBusy(false)
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? [])
    // Clearing the value lets the same file be picked again after a failure.
    event.target.value = ''
    if (picked.length > 0) {
      void uploadAll(picked)
    }
  }

  return (
    <div className={styles.uploader}>
      <input
        ref={inputRef}
        id={inputId}
        className={styles.fileInput}
        type="file"
        accept={accept.join(',')}
        multiple={multiple}
        aria-label={label}
        disabled={disabled || busy}
        onChange={handleChange}
      />
      <LoadingButton
        type="button"
        variant="outline"
        loading={busy}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </LoadingButton>
      {hint && <p className={styles.hint}>{hint}</p>}
      {files.length > 0 && (
        <ul className={styles.files} aria-live="polite">
          {files.map((item) => (
            <li key={item.id} className={styles.file} data-status={item.status}>
              <span className={styles.name}>{item.name}</span>
              <span className={item.status === 'error' ? styles.error : styles.status}>
                {item.status === 'waiting' && 'Waiting…'}
                {item.status === 'uploading' && 'Uploading…'}
                {item.status === 'done' && 'Uploaded'}
                {item.status === 'error' && item.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
