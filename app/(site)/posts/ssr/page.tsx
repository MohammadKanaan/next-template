import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { PageLoading } from '@/components/PageLoading'
import { PostsGrid } from '@/components/Posts/Grid'
import { PostsState } from '@/components/Posts/State'
import { Button } from '@/components/SCN/button'
import { ROUTE_POSTS, ROUTE_POSTS_CSR, ROUTE_POSTS_SSR } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { listPosts } from '@/lib/data/posts'
import styles from '../styles.module.scss'

export const metadata: Metadata = {
  title: 'Posts (SSR)',
  description: 'Posts rendered on the server through the data access layer.',
}

async function PostsList() {
  const { items } = await loadPage(() => listPosts({ page: 1, perPage: 9 }), ROUTE_POSTS_SSR)

  return (
    <PostsState empty={items.length === 0} emptyMessage="No posts found.">
      <PostsGrid posts={items} />
    </PostsState>
  )
}

export default function PostsSsrPage() {
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
        <PostsList />
      </Suspense>
    </div>
  )
}
