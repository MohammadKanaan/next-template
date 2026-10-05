'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { PostsGrid } from '@/components/Posts/Grid'
import { PostsState } from '@/components/Posts/State'
import { Button } from '@/components/SCN/button'
import { useApiData } from '@/hooks/useApiData'
import { ROUTE_POSTS, ROUTE_POSTS_SSR } from '@/lib/constants-routes'
import { queryKeys } from '@/lib/queryKeys'
import { PostPresenter } from '@/presenters/Post/PostPresenter'
import PostsService, { type PostResponse } from '@/services/PostsService'
import type { Listing } from '@/types/api'
import styles from '../styles.module.scss'

const PER_PAGE = 9

export function PostsCsrView() {
  const [page, setPage] = useState(1)

  const { data, isLoading, errorMessage, refresh } = useApiData<Listing<PostResponse>>(
    queryKeys.posts({ page, per_page: PER_PAGE }),
    (signal) => PostsService.list({ page, per_page: PER_PAGE }, signal),
    { fallbackErrorMessage: 'Failed to load posts' },
  )

  const posts = useMemo(() => (data?.list ?? []).map((post) => new PostPresenter(post)), [data])

  return (
    <div className={styles.page}>
      <PageHeader
        title="Posts (CSR)"
        description="Fetched in the browser through the API layer"
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
      <PostsState
        loading={isLoading}
        empty={!isLoading && !errorMessage && posts.length === 0}
        emptyMessage="No posts found."
        errorMessage={errorMessage}
        onRetry={() => void refresh()}
      >
        <PostsGrid posts={posts} />
        <Pagination
          page={page}
          totalPages={data?.total_pages ?? 1}
          onPageChange={setPage}
          disabled={isLoading}
        />
      </PostsState>
    </div>
  )
}
