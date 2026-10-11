'use client'

import type { ReactNode } from 'react'
import { Pagination } from '@/components/Pagination'
import { PostsFilters } from '@/components/Posts/Filters'
import { useUrlState } from '@/hooks/useUrlState'
import { postsUrlQuery } from '@/lib/dto/posts'
import styles from './styles.module.scss'

type PostsViewProps = {
  page: number
  totalPages: number
  /** The server-rendered list. */
  children: ReactNode
}

export const PostsView = ({ page, totalPages, children }: PostsViewProps) => {
  const { state, setState, isPending } = useUrlState(postsUrlQuery)

  return (
    <div className={styles.view}>
      <PostsFilters
        q={state.q}
        sort={state.sort}
        onChange={(patch) => setState({ ...patch, page: 1 })}
      />
      {children}
      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={(next) => setState({ page: next })}
        disabled={isPending}
      />
    </div>
  )
}
