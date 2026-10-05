'use client'

import { useId, useRef, useState, type ChangeEvent } from 'react'
import { LoadingButton } from '@/components/LoadingButton'
import { UserAvatar } from '@/components/UserAvatar'
import { uploadFile } from '@/lib/client/uploads'
import {
  AVATAR_CONTENT_TYPES,
  createAvatarUploadInput,
  type CreateAvatarUploadInput,
  type UploadTicket,
} from '@/lib/dto/uploads'
import type { CurrentUser } from '@/lib/dto/users'
import type { ActionResult } from '@/types/api'
import styles from './styles.module.scss'

export type AvatarUploaderProps = {
  name: string
  image: string | null
  /** Asks for a presigned upload (a Server Action). */
  onCreateUpload: (input: CreateAvatarUploadInput) => Promise<ActionResult<UploadTicket>>
  /** Makes the finished upload the avatar (a Server Action). */
  onAttach: (uploadId: string) => Promise<ActionResult<CurrentUser>>
  onUploaded?: (user: CurrentUser) => void
}

export function AvatarUploader({
  name,
  image,
  onCreateUpload,
  onAttach,
  onUploaded,
}: AvatarUploaderProps) {
  const inputId = useId()
  const errorId = `${inputId}-error`
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const upload = async (file: File) => {
    const input = createAvatarUploadInput.safeParse({ contentType: file.type, size: file.size })
    if (!input.success) {
      setError(input.error.issues[0].message)
      return
    }
    setError(null)
    setUploading(true)
    try {
      const ticket = await onCreateUpload(input.data)
      if (!ticket.ok) {
        setError(ticket.message)
        return
      }
      await uploadFile(ticket.data, file)
      const attached = await onAttach(ticket.data.uploadId)
      if (!attached.ok) {
        setError(attached.message)
        return
      }
      onUploaded?.(attached.data)
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

  return (
    <div className={styles.uploader}>
      <UserAvatar name={name} image={image} size="lg" />
      <div className={styles.controls}>
        <input
          ref={inputRef}
          id={inputId}
          className={styles.fileInput}
          type="file"
          accept={AVATAR_CONTENT_TYPES.join(',')}
          aria-label="Profile photo"
          aria-describedby={error ? errorId : undefined}
          disabled={uploading}
          onChange={handleChange}
        />
        <LoadingButton
          type="button"
          variant="outline"
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          Change photo
        </LoadingButton>
        <p className={styles.hint}>PNG, JPEG, or WebP, up to 2 MB.</p>
        {error && (
          <p id={errorId} className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
