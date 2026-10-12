'use client'

import { Camera } from 'lucide-react'
import { LoadingButton } from '@/components/LoadingButton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/SCN/tooltip'
import { UserAvatar } from '@/components/UserAvatar'
import { useImageUpload } from '@/hooks/useImageUpload'
import { AVATAR_CONTENT_TYPES, type CreateUploadInput, type UploadTicket } from '@/lib/dto/uploads'
import type { CurrentUser } from '@/lib/dto/users'
import type { ActionResult } from '@/types/api'
import styles from './styles.module.scss'

export type AvatarUploaderProps = {
  name: string
  image: string | null
  /** Asks for a presigned upload ticket (a Server Action). */
  onCreateUpload: (input: CreateUploadInput) => Promise<ActionResult<UploadTicket>>
  /** Makes the finished upload the avatar (a Server Action). */
  onAttach: (key: string) => Promise<ActionResult<CurrentUser>>
  onUploaded?: (user: CurrentUser) => void
}

export const AvatarUploader = ({
  name,
  image,
  onCreateUpload,
  onAttach,
  onUploaded,
}: AvatarUploaderProps) => {
  const { inputId, errorId, inputRef, error, uploading, handleChange, openPicker } = useImageUpload(
    {
      purpose: 'avatar',
      createUpload: onCreateUpload,
      attach: onAttach,
      onAttached: onUploaded,
    },
  )

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
        <Tooltip>
          <TooltipTrigger
            render={
              <LoadingButton
                type="button"
                variant="outline"
                size="icon-sm"
                icon={Camera}
                aria-label="Change photo"
                loading={uploading}
                onClick={openPicker}
              />
            }
          />
          <TooltipContent>Change photo</TooltipContent>
        </Tooltip>
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
