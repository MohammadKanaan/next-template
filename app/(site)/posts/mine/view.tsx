'use client'

import Link from 'next/link'
import { Empty } from '@/components/Empty'
import { Pagination } from '@/components/Pagination'
import { PostStatusActions } from '@/components/Posts/StatusActions'
import { PostStatusBadge } from '@/components/Posts/StatusBadge'
import { PostTags } from '@/components/Posts/Tags'
import { Button } from '@/components/SCN/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/SCN/table'
import { useUrlState } from '@/hooks/useUrlState'
import { ROUTE_POST_DETAILS, ROUTE_POST_EDIT, ROUTE_POST_NEW } from '@/lib/constants-routes'
import type { Page } from '@/lib/dto/common'
import { postsUrlQuery, type PostSummary } from '@/lib/dto/posts'
import { formatDateTime } from '@/lib/formatDate'
import styles from './styles.module.scss'

type MyPostsViewProps = {
  posts: Page<PostSummary>
}

export const MyPostsView = ({ posts }: MyPostsViewProps) => {
  const { setState, isPending } = useUrlState(postsUrlQuery)

  if (posts.items.length === 0) {
    return (
      <Empty
        title="No posts yet"
        description="Write your first post. It starts as a draft until you publish it."
        action={
          <Button asChild>
            <Link href={ROUTE_POST_NEW}>Write a post</Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className={styles.view}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Comments</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts.items.map((post) => (
            <TableRow key={post.id}>
              <TableCell>
                <span className={styles.titleCell}>{post.title}</span>
              </TableCell>
              <TableCell>
                <PostStatusBadge status={post.status} />
              </TableCell>
              <TableCell>
                <PostTags tags={post.tags} />
              </TableCell>
              <TableCell>{post.commentCount}</TableCell>
              <TableCell>{formatDateTime(post.createdAt)}</TableCell>
              <TableCell>
                <div className={styles.actions}>
                  <Button asChild size="sm" variant="secondary">
                    <Link href={ROUTE_POST_DETAILS(post.author.id, post.id)}>View</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={ROUTE_POST_EDIT(post.author.id, post.id)}>Edit</Link>
                  </Button>
                  <PostStatusActions postId={post.id} status={post.status} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Pagination
        page={posts.page}
        totalPages={posts.totalPages}
        onPageChange={(page) => setState({ page })}
        disabled={isPending}
      />
    </div>
  )
}
