import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { PageHeader } from '@/components/PageHeader'
import { PostsGrid } from '@/components/Posts/Grid'
import { PostsState } from '@/components/Posts/State'
import { Button } from '@/components/SCN/button'
import { ROUTE_POSTS, ROUTE_POSTS_CSR } from '@/lib/constants-routes'
import { listPosts } from '@/server/repositories/posts'
import { serializePost } from '@/server/serializers/post'
import styles from '../styles.module.scss'

export const metadata: Metadata = {
  title: 'Posts (SSR)',
  description: 'Posts rendered on the server from Prisma.',
}

export default async function PostsSsrPage() {
  // Render at request time so `next build` never queries the database.
  await connection()

  const { posts } = await listPosts({ skip: 0, take: 9 })
  const list = posts.map((post) => serializePost(post, null))

  return (
    <div className={styles.page}>
      <PageHeader
        title="Posts (SSR)"
        description="Rendered on the server from Prisma"
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
      <PostsState empty={list.length === 0} emptyMessage="No posts found.">
        <PostsGrid posts={list} />
      </PostsState>
    </div>
  )
}
