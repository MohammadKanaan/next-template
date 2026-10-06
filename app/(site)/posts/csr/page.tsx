import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PageLoading } from '@/components/PageLoading'
import { ROUTE_POSTS_CSR } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { listTags } from '@/lib/data/posts'
import { PostsCsrView } from './view'

export const metadata: Metadata = {
  title: 'Posts (CSR)',
  description: 'Posts fetched in the browser through the API layer.',
}

const PostsCsrContent = async () => {
  // Only the tag options are read on the server; the list itself is fetched in the browser.
  const tags = await loadPage(() => listTags(), ROUTE_POSTS_CSR)
  return <PostsCsrView tags={tags} />
}

const PostsCsrPage = () => {
  return (
    <Suspense fallback={<PageLoading />}>
      <PostsCsrContent />
    </Suspense>
  )
}

export default PostsCsrPage
