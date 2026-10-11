import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/SCN/button'
import { ROUTE_POST_NEW, ROUTE_POSTS_MINE } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { listPosts } from '@/lib/data/posts'
import { getCurrentUser } from '@/lib/data/users'
import { postsUrlQuery, toListPostsParams } from '@/lib/dto/posts'
import { toScalarParams } from '@/lib/searchParams'
import styles from '../styles.module.scss'
import { MyPostsView } from './view'

const PER_PAGE = 10

export const metadata: Metadata = {
  title: 'My posts',
}

const MyPostsPage = async ({ searchParams }: PageProps<'/posts/mine'>) => {
  const query = postsUrlQuery.parse(toScalarParams(await searchParams))
  const posts = await loadPage(async () => {
    // Signed out → login. The author listing their own posts sees their drafts too.
    const viewer = await getCurrentUser()
    return listPosts({ ...toListPostsParams(query), perPage: PER_PAGE, authorId: viewer.id })
  }, ROUTE_POSTS_MINE)

  return (
    <div className={styles.page}>
      <PageHeader
        title="My posts"
        description="Your drafts and published posts."
        actions={
          <Button asChild>
            <Link href={ROUTE_POST_NEW}>Write a post</Link>
          </Button>
        }
      />
      <MyPostsView posts={posts} />
    </div>
  )
}

export default MyPostsPage
