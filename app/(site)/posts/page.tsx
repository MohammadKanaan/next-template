import type { Metadata } from 'next'
import Link from 'next/link'
import { Empty } from '@/components/Empty'
import { PageHeader } from '@/components/PageHeader'
import { PostList } from '@/components/Posts/List'
import { Button } from '@/components/SCN/button'
import { ROUTE_POST_NEW, ROUTE_POSTS } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { listPosts } from '@/lib/data/posts'
import { postsUrlQuery, toListPostsParams } from '@/lib/dto/posts'
import { toScalarParams } from '@/lib/searchParams'
import styles from './styles.module.scss'
import { PostsView } from './view'

const PER_PAGE = 9

export const metadata: Metadata = {
  title: 'Posts',
  description: 'Published posts, rendered on the server through the data access layer.',
}

const PostsPage = async ({ searchParams }: PageProps<'/posts'>) => {
  // The same tolerant schema the client hook uses: a garbled URL falls back to the defaults.
  const query = postsUrlQuery.parse(toScalarParams(await searchParams))
  const posts = await loadPage(
    () => listPosts({ ...toListPostsParams(query), perPage: PER_PAGE }),
    ROUTE_POSTS,
  )

  return (
    <div className={styles.page}>
      <PageHeader
        title="Posts"
        description="Everything that has been published."
        actions={
          <Button asChild>
            <Link href={ROUTE_POST_NEW}>Write a post</Link>
          </Button>
        }
      />
      {/* The view is the client part (search, sort, pagination); the list stays server-rendered. */}
      <PostsView page={posts.page} totalPages={posts.totalPages}>
        {posts.items.length === 0 ? (
          <Empty
            title="No posts found"
            description={
              query.q ? 'No post matches your search.' : 'Nothing has been published yet.'
            }
          />
        ) : (
          <PostList posts={posts.items} />
        )}
      </PostsView>
    </div>
  )
}

export default PostsPage
