'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { DeletePostButton } from '@/components/Posts/DeleteButton'
import { Button } from '@/components/SCN/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/SCN/card'
import { ROUTE_POST_EDIT, ROUTE_POSTS } from '@/lib/constants-routes'
import type { PostDetail } from '@/lib/dto/posts'
import { getInitials } from '@/lib/utils'
import { presentUser } from '@/presenters/UserPresenter'
import styles from './styles.module.scss'

type PostDetailViewProps = {
  post: PostDetail
}

export function PostDetailView({ post }: PostDetailViewProps) {
  const author = useMemo(() => presentUser(post.author), [post])

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
    </div>
  )
}
