import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { DeletePostButton } from '@/components/Posts/DeleteButton'
import { PostStatusBadge } from '@/components/Posts/StatusBadge'
import { Button } from '@/components/SCN/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/SCN/card'
import { ROUTE_POST_DETAILS, ROUTE_POST_EDIT, ROUTE_POSTS } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { getPost } from '@/lib/data/posts'
import { formatDateTime } from '@/lib/formatDate'
import { presentUser } from '@/presenters/UserPresenter'
import styles from './styles.module.scss'

export const metadata: Metadata = {
  title: 'Post',
}

/**
 * A Server Component page: it awaits the DAL and renders; only the two buttons are client
 * components. The raw route param goes to the DAL, which treats a malformed id as not found.
 */
const PostDetailPage = async ({ params }: PageProps<'/posts/[id]'>) => {
  const { id } = await params
  const post = await loadPage(() => getPost(id), ROUTE_POST_DETAILS(id))
  const author = presentUser(post.author)

  return (
    <div className={styles.page}>
      <PageHeader
        title={post.title}
        description={`By ${author.name} · ${formatDateTime(post.createdAt)}`}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={ROUTE_POSTS}>Back</Link>
            </Button>
            {post.permissions.update && (
              <Button asChild variant="outline">
                <Link href={ROUTE_POST_EDIT(post.id)}>Edit</Link>
              </Button>
            )}
            {post.permissions.delete && <DeletePostButton postId={post.id} />}
          </>
        }
      />

      <div className={styles.cards}>
        <Card>
          <CardHeader>
            <CardTitle>Post</CardTitle>
          </CardHeader>
          <CardContent>
            {!post.published && (
              <div className={styles.badges}>
                <PostStatusBadge published={post.published} />
              </div>
            )}
            <p className={styles.postBody}>{post.body}</p>
            <p className={styles.meta}>Last updated {formatDateTime(post.updatedAt)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Author</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={styles.meta}>
              <strong>Name:</strong> {author.name}
            </p>
            <p className={styles.meta}>
              <strong>Username:</strong> @{author.username}
            </p>
            {author.website && (
              <p className={styles.meta}>
                <strong>Website:</strong>{' '}
                <a href={author.website} className={styles.link} target="_blank" rel="noreferrer">
                  {author.website}
                </a>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default PostDetailPage
