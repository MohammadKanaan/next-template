import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/SCN/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/SCN/card'
import { ROUTE_POST_NEW, ROUTE_POSTS_CSR, ROUTE_POSTS_SSR } from '@/lib/constants-routes'
import styles from './styles.module.scss'

export const metadata: Metadata = {
  title: 'Posts',
  description: 'Compare server-rendered and client-rendered post lists.',
}

export default function PostsPage() {
  return (
    <div className={styles.page}>
      <PageHeader
        title="Posts"
        description="Pick a rendering mode to compare SSR vs CSR, or write a new post."
      />

      <div className={styles.cards}>
        <Card>
          <CardHeader>
            <CardTitle>SSR</CardTitle>
          </CardHeader>
          <CardContent>Server Component calling the DAL directly.</CardContent>
          <CardFooter>
            <Button asChild>
              <Link href={ROUTE_POSTS_SSR}>Open SSR</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>CSR</CardTitle>
          </CardHeader>
          <CardContent>
            Client component fetching <code>/api/v1/posts</code> through a typed facade.
          </CardContent>
          <CardFooter>
            <Button asChild variant="secondary">
              <Link href={ROUTE_POSTS_CSR}>Open CSR</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Write a post</CardTitle>
          </CardHeader>
          <CardContent>Create a post with a Server Action. Requires a login.</CardContent>
          <CardFooter>
            <Button asChild variant="outline">
              <Link href={ROUTE_POST_NEW}>Write a post</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
