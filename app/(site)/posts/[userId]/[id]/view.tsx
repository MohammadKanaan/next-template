'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { PostsState } from '@/components/Posts/State'
import { Button } from '@/components/SCN/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/SCN/card'
import { useApiData } from '@/hooks/useApiData'
import { ROUTE_POST_DETAILS, ROUTE_POST_EDIT, ROUTE_POSTS } from '@/lib/constants-routes'
import { queryKeys } from '@/lib/queryKeys'
import { PostPresenter } from '@/presenters/Post/PostPresenter'
import PostsService, { type PostDetailedResponse } from '@/services/PostsService'
import styles from './styles.module.scss'

type PostDetailViewProps = {
  userId: number
  id: number
}

export function PostDetailView({ userId, id }: PostDetailViewProps) {
  const router = useRouter()

  const { data, isLoading, errorMessage, refresh } = useApiData<PostDetailedResponse>(
    queryKeys.post(id),
    (signal) => PostsService.getById(id, signal),
    { toast: false },
  )

  const post = useMemo(() => (data ? new PostPresenter(data) : null), [data])
  const author = post?.user

  useEffect(() => {
    if (post && post.user_id !== userId) {
      router.replace(ROUTE_POST_DETAILS(post.user_id, post.id))
    }
  }, [post, userId, router])

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
            <Button type="button" onClick={() => void refresh()}>
              Refresh
            </Button>
            {post?.permissions.update && (
              <Button asChild variant="outline">
                <Link href={ROUTE_POST_EDIT(post.user_id, post.id)}>Edit</Link>
              </Button>
            )}
          </>
        }
      />

      <PostsState
        loading={isLoading}
        empty={!isLoading && !errorMessage && !post}
        emptyMessage="No post found."
        errorMessage={errorMessage}
        onRetry={() => void refresh()}
      >
        {post && (
          <div className={styles.cards}>
            <Card>
              <CardHeader>
                <CardTitle>Post</CardTitle>
              </CardHeader>
              <CardContent>
                <h2 className={styles.postTitle}>{post.display_title}</h2>
                {post.body && <p className={styles.postBody}>{post.body}</p>}
                <p className={styles.meta}>
                  <strong>Post ID:</strong> {post.id} • <strong>User ID:</strong> {post.user_id}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Author</CardTitle>
              </CardHeader>
              <CardContent>
                {author ? (
                  <>
                    <p className={styles.meta}>
                      <strong>Initials:</strong> {author.initials}
                    </p>
                    <p className={styles.meta}>
                      <strong>Name:</strong> {author.name}
                    </p>
                    <p className={styles.meta}>
                      <strong>Username:</strong> {author.username}
                    </p>
                    {author.website_url && (
                      <p className={styles.meta}>
                        <strong>Website:</strong>{' '}
                        <a
                          href={author.website_url}
                          className={styles.link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {author.website}
                        </a>
                      </p>
                    )}
                  </>
                ) : (
                  <p className={styles.meta}>Author could not be loaded.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </PostsState>
    </div>
  )
}
