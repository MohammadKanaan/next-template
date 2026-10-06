'use client'

import type { ReactNode } from 'react'
import { Pagination } from '@/components/Pagination'
import { PostsFilters } from '@/components/Posts/Filters'
import { useUrlState } from '@/hooks/useUrlState'
import { postsUrlQuery, type TagSummary } from '@/lib/dto/posts'
import styles from './styles.module.scss'

type PostsSsrViewProps = {
  page: number
  totalPages: number
  tags: TagSummary[]
  /** The server-rendered list. */
  children: ReactNode
}

export const PostsSsrView = ({ page, totalPages, tags, children }: PostsSsrViewProps) => {
  const { state, setState, isPending } = useUrlState(postsUrlQuery)

  return (
    <div className={styles.view}>
      <PostsFilters
        q={state.q}
        sort={state.sort}
        tag={state.tag}
        from={state.from}
        to={state.to}
        tags={tags}
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
