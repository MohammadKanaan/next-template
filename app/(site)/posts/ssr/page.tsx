import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { PageLoading } from '@/components/PageLoading'
import { Button } from '@/components/SCN/button'
import { ROUTE_POSTS, ROUTE_POSTS_CSR, ROUTE_POSTS_SSR } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { listPosts } from '@/lib/data/posts'
import { postsUrlQuery } from '@/lib/dto/posts'
import styles from '../styles.module.scss'
import { PostsSsrView } from './view'

const PER_PAGE = 9

export const metadata: Metadata = {
  title: 'Posts (SSR)',
  description: 'Posts rendered on the server through the data access layer.',
}

type PostsListProps = Pick<PageProps<'/posts/ssr'>, 'searchParams'>

async function PostsList({ searchParams }: PostsListProps) {
  // The same tolerant schema the client hook uses: a garbled URL falls back to the defaults.
  const query = postsUrlQuery.parse(await searchParams)
  const posts = await loadPage(() => listPosts({ ...query, perPage: PER_PAGE }), ROUTE_POSTS_SSR)

  return <PostsSsrView posts={posts} />
}

export default function PostsSsrPage({ searchParams }: PageProps<'/posts/ssr'>) {
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
      <Suspense fallback={<PageLoading />}>
        <PostsList searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
