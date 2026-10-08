'use client'

import { useState, type ReactNode } from 'react'
import { CommentItem } from '@/components/Comments/Item'
import { LoadingButton } from '@/components/LoadingButton'
import { useInfiniteList } from '@/hooks/useInfiniteList'
import { fetchComments } from '@/lib/client/comments'
import type { Comment } from '@/lib/dto/comments'
import styles from './styles.module.scss'

type CommentListProps = {
  postId: number
  /** Where the page rendered in `children` ends; `null` when it was the last one. */
  nextCursor: string | null
  /** The server-rendered first page, as `CommentItem`s, so it stays server-rendered. */
  children: ReactNode
}

/** The comment list: the server-rendered first page, then the pages the reader asks for. */
export const CommentList = ({ postId, nextCursor, children }: CommentListProps) => {
  // Starts empty: the first page is `children`, only the pages loaded here live in the hook.
  const list = useInfiniteList<Comment>(
    (cursor, signal) => fetchComments(postId, { cursor: cursor ?? undefined }, signal),
    { initial: { items: [], nextCursor } },
  )
  // A comment deleted from a loaded page leaves the list now; the router refresh only reaches the
  // server-rendered page.
  const [deletedIds, setDeletedIds] = useState<number[]>([])

  return (
    <>
      <ul className={styles.list}>
        {children}
        {list.items
          .filter((comment) => !deletedIds.includes(comment.id))
          .map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onDeleted={(deleted) => setDeletedIds((current) => [...current, deleted.id])}
            />
          ))}
      </ul>
      {list.error && (
        <p className={styles.error} role="alert">
          {list.error}
        </p>
      )}
      {list.hasMore && (
        <div className={styles.more}>
          <LoadingButton
            type="button"
            variant="outline"
            loading={list.isLoading}
            onClick={list.loadMore}
          >
            Load more comments
          </LoadingButton>
        </div>
      )}
    </>
  )
}
