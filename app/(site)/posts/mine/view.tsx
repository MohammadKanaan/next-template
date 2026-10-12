'use client'

import { ActionGroup } from '@/components/ActionGroup'
import { ActionLink } from '@/components/ActionLink'
import { ButtonLink } from '@/components/ButtonLink'
import { Empty } from '@/components/Empty'
import { Pagination } from '@/components/Pagination'
import { PostsFilters } from '@/components/Posts/Filters'
import { PostStatusBadge } from '@/components/Posts/StatusBadge'
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
  const { state, setState, isPending } = useUrlState(postsUrlQuery)

  return (
    <div className={styles.view}>
      <PostsFilters
        q={state.q}
        sort={state.sort}
        onChange={(patch) => setState({ ...patch, page: 1 })}
      />
      {posts.items.length === 0 ? (
        posts.totalItems === 0 && !state.q ? (
          <Empty
            title="No posts yet"
            description="Write your first post. It stays a draft until you publish it."
            action={<ButtonLink href={ROUTE_POST_NEW}>Write a post</ButtonLink>}
          />
        ) : posts.totalItems === 0 ? (
          <Empty title="No matching posts" description="No post matches your search." />
        ) : (
          <Empty
            title="No posts on this page"
            description="This page is past the end of the list. Go back to see your posts."
          />
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
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
                  <PostStatusBadge published={post.published} />
                </TableCell>
                <TableCell>{formatDateTime(post.createdAt)}</TableCell>
                <TableCell>
                  <ActionGroup label={`Actions for ${post.title}`}>
                    <ActionLink
                      action="view"
                      label={`View ${post.title}`}
                      href={ROUTE_POST_DETAILS(post.id)}
                    />
                    <ActionLink
                      action="edit"
                      label={`Edit ${post.title}`}
                      href={ROUTE_POST_EDIT(post.id)}
                    />
                  </ActionGroup>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Pagination
        page={posts.page}
        totalPages={posts.totalPages}
        onPageChange={(page) => setState({ page })}
        disabled={isPending}
      />
    </div>
  )
}
