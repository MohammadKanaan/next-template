import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { PostsGrid } from '@/components/Posts/Grid'
import { PostsState } from '@/components/Posts/State'
import { Button } from '@/components/SCN/button'
import { ROUTE_POSTS, ROUTE_POSTS_CSR, ROUTE_POSTS_SSR } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { listPosts, listTags } from '@/lib/data/posts'
import { hasActivePostFilters, postsUrlQuery, toListPostsParams } from '@/lib/dto/posts'
import { toScalarParams } from '@/lib/searchParams'
import styles from '../styles.module.scss'
import { PostsSsrView } from './view'

const PER_PAGE = 9

export const metadata: Metadata = {
  title: 'Posts (SSR)',
  description: 'Posts rendered on the server through the data access layer.',
}

const PostsSsrPage = async ({ searchParams }: PageProps<'/posts/ssr'>) => {
  // The same tolerant schema the client hook uses: a garbled URL falls back to the defaults.
  const query = postsUrlQuery.parse(toScalarParams(await searchParams))
  const [posts, tags] = await loadPage(
    () => Promise.all([listPosts({ ...toListPostsParams(query), perPage: PER_PAGE }), listTags()]),
    ROUTE_POSTS_SSR,
  )

  return (
    <div className={styles.page}>
      <PageHeader
        title="Posts (SSR)"
        description="Server Component calling the DAL directly"
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={ROUTE_POSTS}>Back</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href={ROUTE_POSTS_CSR}>View CSR page</Link>
            </Button>
          </>
        }
      />
      {/* The view is the client part (filters, pagination); the list stays server-rendered. */}
      <PostsSsrView page={posts.page} totalPages={posts.totalPages} tags={tags}>
        <PostsState
          empty={posts.items.length === 0}
          emptyMessage={
            hasActivePostFilters(query) ? 'No posts match your filters.' : 'No posts found.'
          }
        >
          <PostsGrid posts={posts.items} />
        </PostsState>
      </PostsSsrView>
    </div>
  )
}

export default PostsSsrPage
