import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { CommentThread } from '@/components/Comments/Thread'
import { PageHeader } from '@/components/PageHeader'
import { DeletePostButton } from '@/components/Posts/DeleteButton'
import { PostStatusActions } from '@/components/Posts/StatusActions'
import { PostStatusBadge } from '@/components/Posts/StatusBadge'
import { PostTags } from '@/components/Posts/Tags'
import { Button } from '@/components/SCN/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/SCN/card'

import { ROUTE_POST_DETAILS, ROUTE_POST_EDIT, ROUTE_POSTS } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { getPost } from '@/lib/data/posts'
import { getInitials } from '@/lib/getInitials'
import { presentUser } from '@/presenters/UserPresenter'
import styles from './styles.module.scss'

export const metadata: Metadata = {
  title: 'Post details',
}

const PostDetailPage = async ({ params }: PageProps<'/posts/[userId]/[id]'>) => {
  const { userId, id } = await params
  const post = await loadPage(() => getPost(id), ROUTE_POST_DETAILS(userId, id))
  if (post.author.id !== userId) {
    redirect(ROUTE_POST_DETAILS(post.author.id, post.id))
  }
  const author = presentUser(post.author)

  return (
    <div className={styles.page}>
      <PageHeader
        title="Post details"
        description="Post and author details"
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={ROUTE_POSTS}>Back</Link>
            </Button>
            {post.permissions.update && <PostStatusActions postId={post.id} status={post.status} />}
            {post.permissions.update && (
              <Button asChild variant="outline">
                <Link href={ROUTE_POST_EDIT(post.author.id, post.id)}>Edit</Link>
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
            <div className={styles.badges}>
              <PostStatusBadge status={post.status} />
              <PostTags tags={post.tags} />
            </div>
            <h2 className={styles.postTitle}>{post.title}</h2>
            {post.body && <p className={styles.postBody}>{post.body}</p>}
            <p className={styles.meta}>
              <strong>Post ID:</strong> {post.id} • <strong>Author ID:</strong> {post.author.id}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Author</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={styles.meta}>
              <strong>Initials:</strong> {getInitials(author.name || author.username)}
            </p>
            <p className={styles.meta}>
              <strong>Name:</strong> {author.name}
            </p>
            <p className={styles.meta}>
              <strong>Username:</strong> {author.username}
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

      <Suspense fallback={null}>
        <CommentThread
          postId={post.id}
          postStatus={post.status}
          path={ROUTE_POST_DETAILS(post.author.id, post.id)}
        />
      </Suspense>
    </div>
  )
}

export default PostDetailPage
