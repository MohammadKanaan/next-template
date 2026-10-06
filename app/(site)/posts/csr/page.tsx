import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PageLoading } from '@/components/PageLoading'
import { PostsCsrView } from './view'

export const metadata: Metadata = {
  title: 'Posts (CSR)',
  description: 'Posts fetched in the browser through the API layer.',
}

const PostsCsrPage = () => {
  // This page reads nothing on the server, so the view's `useSearchParams` needs a boundary.
  return (
    <Suspense fallback={<PageLoading />}>
      <PostsCsrView />
    </Suspense>
  )
}

export default PostsCsrPage
