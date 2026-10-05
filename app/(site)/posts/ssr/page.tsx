import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { PageHeader } from '@/components/PageHeader'
import { PostsGrid } from '@/components/Posts/Grid'
import { PostsState } from '@/components/Posts/State'
import { Button } from '@/components/SCN/button'
import { ROUTE_POSTS, ROUTE_POSTS_CSR } from '@/lib/constants-routes'
import { listPosts } from '@/lib/data/posts'
import styles from '../styles.module.scss'

export const metadata: Metadata = {
  title: 'Posts (SSR)',
  description: 'Posts rendered on the server through the data access layer.',
}

export default async function PostsSsrPage() {
  // Render at request time so `next build` never queries the database.
  await connection()

  const { items } = await listPosts({ page: 1, perPage: 9 })

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
      <PostsState empty={items.length === 0} emptyMessage="No posts found.">
        <PostsGrid posts={items} />
      </PostsState>
    </div>
  )
}
