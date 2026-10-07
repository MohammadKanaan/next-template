'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { PostsFilters } from '@/components/Posts/Filters'
import { PostsGrid } from '@/components/Posts/Grid'
import { PostsState } from '@/components/Posts/State'
import { Button } from '@/components/SCN/button'
import { useUrlState } from '@/hooks/useUrlState'
import { RequestError } from '@/lib/client/errors'
import { fetchPosts } from '@/lib/client/posts'
import { ROUTE_POSTS, ROUTE_POSTS_SSR } from '@/lib/constants-routes'
import type { Page } from '@/lib/dto/common'
import {
  hasActivePostFilters,
  postsUrlQuery,
  toListPostsParams,
  type PostSummary,
  type TagSummary,
} from '@/lib/dto/posts'
import styles from '../styles.module.scss'

const PER_PAGE = 9

type LoadResult = { key: string; data: Page<PostSummary> | null; errorMessage: string }

const toErrorMessage = (error: unknown) => {
  return error instanceof RequestError
    ? error.message
    : 'Could not load posts. Check your connection.'
}

type PostsCsrViewProps = {
  tags: TagSummary[]
}

export const PostsCsrView = ({ tags }: PostsCsrViewProps) => {
  const { state, setState } = useUrlState(postsUrlQuery)
  const { page, q, sort, status, tag, from, to } = state
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<LoadResult | null>(null)
  const requestKey = JSON.stringify([page, q, sort, status, tag, from, to, attempt])

  useEffect(() => {
    const controller = new AbortController()
    fetchPosts(
      { ...toListPostsParams({ page, q, sort, status, tag, from, to }), perPage: PER_PAGE },
      controller.signal,
    ).then(
      (data) => setResult({ key: requestKey, data, errorMessage: '' }),
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, data: null, errorMessage: toErrorMessage(error) })
        }
      },
    )
    return () => controller.abort()
  }, [page, q, sort, status, tag, from, to, requestKey])

  // A result for an older page/attempt counts as still loading.
  const loaded = result?.key === requestKey ? result : null
  const isLoading = loaded === null
  const data = loaded?.data ?? null
  const errorMessage = loaded?.errorMessage ?? ''
  const posts = data?.items ?? []

  return (
    <div className={styles.page}>
      <PageHeader
        title="Posts (CSR)"
        description="Fetched in the browser through the client facade and Route Handler"
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={ROUTE_POSTS}>Back</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href={ROUTE_POSTS_SSR}>View SSR page</Link>
            </Button>
          </>
        }
      />
      <PostsFilters
        q={q}
        sort={sort}
        tag={tag}
        from={from}
        to={to}
        tags={tags}
        onChange={(patch) => setState({ ...patch, page: 1 })}
      />
      <PostsState
        loading={isLoading}
        empty={!isLoading && !errorMessage && posts.length === 0}
        emptyMessage={
          hasActivePostFilters(state) ? 'No posts match your filters.' : 'No posts found.'
        }
        errorMessage={errorMessage}
        onRetry={() => setAttempt((value) => value + 1)}
      >
        <PostsGrid posts={posts} />
        <Pagination
          page={page}
          totalPages={data?.totalPages ?? 1}
          onPageChange={(next) => setState({ page: next })}
          disabled={isLoading}
        />
      </PostsState>
    </div>
  )
}
