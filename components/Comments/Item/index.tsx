import { DeleteCommentButton } from '@/components/Comments/DeleteButton'
import type { Comment } from '@/lib/dto/comments'
import { formatDateTime } from '@/lib/formatDate'
import styles from './styles.module.scss'

type CommentItemProps = {
  comment: Comment
  /** Called after the viewer deleted the comment, for a list that keeps its own copy. */
  onDeleted?: (comment: Comment) => void
}

/** One comment of a thread. No state of its own, so it renders on the server and in a list alike. */
export const CommentItem = ({ comment, onDeleted }: CommentItemProps) => {
  return (
    <li className={styles.comment}>
      <div className={styles.header}>
        <span className={styles.author}>{comment.author.name}</span>
        <time className={styles.date} dateTime={comment.createdAt.toISOString()}>
          {formatDateTime(comment.createdAt)}
        </time>
        {comment.permissions.delete && (
          <DeleteCommentButton commentId={comment.id} onDeleted={() => onDeleted?.(comment)} />
        )}
      </div>
      <p className={styles.body}>{comment.body}</p>
    </li>
  )
}
