import type { Attachment } from '@/lib/dto/uploads'
import { formatBytes } from '@/lib/formatBytes'
import styles from './styles.module.scss'

type PostAttachmentListProps = {
  attachments: Attachment[]
}

/** The files attached to a post, as links (the detail page). Renders nothing when there are none. */
export const PostAttachmentList = ({ attachments }: PostAttachmentListProps) => {
  if (attachments.length === 0) {
    return null
  }
  return (
    <ul className={styles.list} aria-label="Attachments">
      {attachments.map((attachment) => (
        <li key={attachment.id} className={styles.item}>
          <a href={attachment.url} className={styles.link} target="_blank" rel="noreferrer">
            {attachment.name}
          </a>
          <span className={styles.meta}>{formatBytes(attachment.size)}</span>
        </li>
      ))}
    </ul>
  )
}
