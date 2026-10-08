import Link from 'next/link'
import { CommentForm } from '@/components/Comments/Form'
import { CommentItem } from '@/components/Comments/Item'
import { CommentList } from '@/components/Comments/List'
import { Button } from '@/components/SCN/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/SCN/card'
import { loginPath } from '@/lib/constants-routes'
import { listComments } from '@/lib/data/comments'
import { loadPage } from '@/lib/data/page'
import { getViewer } from '@/lib/data/users'
import type { PostStatus } from '@/lib/dto/posts'
import styles from './styles.module.scss'

type CommentThreadProps = {
  postId: number
  postStatus: PostStatus
  /** The post's total; the first page holds only some of them. */
  commentCount: number
  /** Where the post lives, so the sign-in link can return to it. */
  path: string
}

/**
 * The comment thread of a post. An async Server Component that reads the DAL itself, so the page
 * puts it in its own `<Suspense>`. It renders the first page of comments; `CommentList` (client)
 * wraps that markup as `children` and loads the later pages on demand. The form and the delete
 * buttons are client components too.
 */
export const CommentThread = async ({
  postId,
  postStatus,
  commentCount,
  path,
}: CommentThreadProps) => {
  const [page, viewer] = await loadPage(
    () => Promise.all([listComments(postId), getViewer()]),
    path,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comments ({commentCount})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={styles.content}>
          {page.items.length === 0 ? (
            <p className={styles.empty}>No comments yet.</p>
          ) : (
            <CommentList postId={postId} nextCursor={page.nextCursor} commentCount={commentCount}>
              {page.items.map((comment) => (
                <CommentItem key={comment.id} comment={comment} />
              ))}
            </CommentList>
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
