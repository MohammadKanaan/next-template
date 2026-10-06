import Link from 'next/link'
import { DeleteCommentButton } from '@/components/Comments/DeleteButton'
import { CommentForm } from '@/components/Comments/Form'
import { Button } from '@/components/SCN/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/SCN/card'
import { loginPath } from '@/lib/constants-routes'
import { listComments } from '@/lib/data/comments'
import { loadPage } from '@/lib/data/page'
import { getViewer } from '@/lib/data/users'
import type { PostStatus } from '@/lib/dto/posts'
import { formatDateTime } from '@/lib/formatDate'
import styles from './styles.module.scss'

type CommentThreadProps = {
  postId: number
  postStatus: PostStatus
  /** Where the post lives, so the sign-in link can return to it. */
  path: string
}

/**
 * The comment thread of a post. An async Server Component that reads the DAL itself, so the page
 * puts it in its own `<Suspense>`. Only the form and the delete buttons are client components.
 */
export const CommentThread = async ({ postId, postStatus, path }: CommentThreadProps) => {
  const [comments, viewer] = await loadPage(
    () => Promise.all([listComments(postId), getViewer()]),
    path,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comments ({comments.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={styles.content}>
          {comments.length === 0 ? (
            <p className={styles.empty}>No comments yet.</p>
          ) : (
            <ul className={styles.list}>
              {comments.map((comment) => (
                <li key={comment.id} className={styles.comment}>
                  <div className={styles.commentHeader}>
                    <span className={styles.author}>{comment.author.name}</span>
                    <time className={styles.date} dateTime={comment.createdAt.toISOString()}>
                      {formatDateTime(comment.createdAt)}
                    </time>
                    {comment.permissions.delete && <DeleteCommentButton commentId={comment.id} />}
                  </div>
                  <p className={styles.body}>{comment.body}</p>
                </li>
              ))}
            </ul>
          )}

          {postStatus !== 'published' ? (
            <p className={styles.empty}>Comments are closed while this post is not published.</p>
          ) : viewer ? (
            <CommentForm postId={postId} />
          ) : (
            <p className={styles.empty}>
              <Button asChild variant="link">
                <Link href={loginPath(path)}>Sign in</Link>
              </Button>{' '}
              to join the discussion.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
