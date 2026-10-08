'use client'

import { useState } from 'react'
import { FileUploader } from '@/components/Form/FileUploader'
import { LoadingButton } from '@/components/LoadingButton'
import { uploadFile } from '@/lib/client/uploads'
import {
  createUploadInput,
  POST_ATTACHMENTS_MAX,
  UPLOAD_RULES,
  type Attachment,
  type CreateUploadInput,
  type UploadTicket,
} from '@/lib/dto/uploads'
import { formatBytes } from '@/lib/formatBytes'
import type { ActionResult } from '@/types/api'
import styles from './styles.module.scss'

const rule = UPLOAD_RULES.attachment

export type PostAttachmentsProps = {
  /** The post the files belong to; a ticket is only issued to someone who may edit it. */
  postId: number
  /** The files the post has when the page loads; the list follows the actions' results after that. */
  attachments: Attachment[]
  /** Asks for a presigned upload (a Server Action). */
  onCreateUpload: (input: CreateUploadInput) => Promise<ActionResult<UploadTicket>>
  /** Attaches the finished upload to the post (a Server Action). */
  onAttach: (uploadId: string) => Promise<ActionResult<Attachment>>
  /** Removes an attachment from the post (a Server Action). */
  onDetach: (uploadId: string) => Promise<ActionResult<null>>
}

/**
 * The edit page's attachments: the current files with a remove button, and an uploader. The list
 * is this component's own state, updated from what the actions return: refreshing the page instead
 * would re-render the post form beside it, and a form that follows the server's values discards
 * what the author has typed.
 */
export const PostAttachments = ({
  postId,
  attachments: initial,
  onCreateUpload,
  onAttach,
  onDetach,
}: PostAttachmentsProps) => {
  const [attachments, setAttachments] = useState(initial)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const slotsLeft = Math.max(POST_ATTACHMENTS_MAX - attachments.length, 0)
  const full = slotsLeft === 0

  const upload = async (file: File) => {
    const input = createUploadInput.safeParse({
      purpose: 'attachment',
      contentType: file.type,
      size: file.size,
      name: file.name,
      postId,
    })
    if (!input.success) {
      throw new Error(input.error.issues[0].message)
    }
    const ticket = await onCreateUpload(input.data)
    if (!ticket.ok) {
      throw new Error(ticket.message)
    }
    await uploadFile(ticket.data, file)
    const attached = await onAttach(ticket.data.uploadId)
    if (!attached.ok) {
      throw new Error(attached.message)
    }
    setAttachments((current) => [...current, attached.data])
  }

  const remove = async (attachment: Attachment) => {
    setError(null)
    setRemoving(attachment.id)
    try {
      const result = await onDetach(attachment.id)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setAttachments((current) => current.filter((item) => item.id !== attachment.id))
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className={styles.attachments}>
      {attachments.length === 0 ? (
        <p className={styles.empty}>No attachments yet.</p>
      ) : (
        <ul className={styles.list}>
          {attachments.map((attachment) => (
            <li key={attachment.id} className={styles.item}>
              <a href={attachment.url} className={styles.link} target="_blank" rel="noreferrer">
                {attachment.name}
              </a>
              <span className={styles.meta}>{formatBytes(attachment.size)}</span>
              <LoadingButton
                type="button"
                size="sm"
                variant="ghost"
                loading={removing === attachment.id}
                disabled={removing !== null}
                aria-label={`Remove ${attachment.name}`}
                onClick={() => remove(attachment)}
              >
                Remove
              </LoadingButton>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <FileUploader
        label="Add files"
        accept={rule.contentTypes}
        maxSize={rule.maxSize}
        multiple
        maxFiles={slotsLeft}
        disabled={full}
        hint={
          full
            ? `A post can have at most ${POST_ATTACHMENTS_MAX} attachments.`
            : `Images, PDF or CSV, up to ${formatBytes(rule.maxSize)} each. ${attachments.length} of ${POST_ATTACHMENTS_MAX} used.`
        }
        onUpload={upload}
      />
    </div>
  )
}
