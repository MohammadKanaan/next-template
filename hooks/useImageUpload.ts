'use client'

import { useId, useRef, useState, type ChangeEvent } from 'react'
import { uploadFile } from '@/lib/client/uploads'
import {
  createUploadInput,
  type CreateUploadInput,
  type UploadPurpose,
  type UploadTicket,
} from '@/lib/dto/uploads'
import type { ActionResult } from '@/types/api'

type UseImageUploadOptions<T> = {
  purpose: UploadPurpose
  /** Asks for a presigned upload ticket (`createUploadAction`). */
  createUpload: (input: CreateUploadInput) => Promise<ActionResult<UploadTicket>>
  /** Makes the finished upload part of its record (`attachPosterAction`, …). */
  attach: (key: string) => Promise<ActionResult<T>>
  onAttached?: (data: T) => void
}

/**
 * The upload flow behind every image picker: the file is checked against the purpose's rule in the
 * browser, a ticket is asked for, the file goes straight to storage and the key is attached. Each
 * failure lands in `error`; the component renders the hidden file input and the button that opens
 * it (`openPicker`).
 */
export const useImageUpload = <T>({
  purpose,
  createUpload,
  attach,
  onAttached,
}: UseImageUploadOptions<T>) => {
  const inputId = useId()
  const errorId = `${inputId}-error`
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const upload = async (file: File) => {
    const input = createUploadInput.safeParse({
      purpose,
      contentType: file.type,
      size: file.size,
    })
    if (!input.success) {
      setError(input.error.issues[0].message)
      return
    }
    setError(null)
    setUploading(true)
    try {
      const ticket = await createUpload(input.data)
      if (!ticket.ok) {
        setError(ticket.message)
        return
      }
      await uploadFile(ticket.data, file)
      const attached = await attach(ticket.data.key)
      if (!attached.ok) {
        setError(attached.message)
        return
      }
      onAttached?.(attached.data)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'The upload failed. Try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Clearing the value lets the same file be picked again after a failure.
    event.target.value = ''
    if (file) {
      void upload(file)
    }
  }

  const openPicker = () => inputRef.current?.click()

  return { inputId, errorId, inputRef, error, setError, uploading, handleChange, openPicker }
}
