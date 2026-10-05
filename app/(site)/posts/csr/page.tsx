import type { Metadata } from 'next'
import { PostsCsrView } from './view'

export const metadata: Metadata = {
  title: 'Posts (CSR)',
  description: 'Posts fetched in the browser through the API layer.',
}

export default function PostsCsrPage() {
  return <PostsCsrView />
}
