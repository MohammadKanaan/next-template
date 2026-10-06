'use client'

import { Pagination } from '@/components/Pagination'
import { PostsFilters } from '@/components/Posts/Filters'
import { PostsGrid } from '@/components/Posts/Grid'
import { PostsState } from '@/components/Posts/State'
import { useUrlState } from '@/hooks/useUrlState'
import type { Page } from '@/lib/dto/common'
import { postsUrlQuery, type PostSummary } from '@/lib/dto/posts'
import styles from './styles.module.scss'

type PostsSsrViewProps = {
  posts: Page<PostSummary>
}

export function PostsSsrView({ posts }: PostsSsrViewProps) {
  const { state, setState, isPending } = useUrlState(postsUrlQuery)

  return (
    <div className={styles.view}>
      <PostsFilters
        q={state.q}
        sort={state.sort}
        onChange={(patch) => setState({ ...patch, page: 1 })}
      />
      <PostsState
        empty={posts.items.length === 0}
        emptyMessage={state.q ? 'No posts match your search.' : 'No posts found.'}
      >
        <PostsGrid posts={posts.items} />
      </PostsState>
      <Pagination
        page={posts.page}
        totalPages={posts.totalPages}
        onPageChange={(page) => setState({ page })}
        disabled={isPending}
      />
    </div>
  )
}
