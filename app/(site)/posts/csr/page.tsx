import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PageLoading } from '@/components/PageLoading'
import { PostsCsrView } from './view'

export const metadata: Metadata = {
  title: 'Posts (CSR)',
  description: 'Posts fetched in the browser through the API layer.',
}

export default function PostsCsrPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <PostsCsrView />
    </Suspense>
  )
}
