import type { Metadata } from 'next'
import { NO_INDEX } from '@/lib/seo'
import { PostNewView } from './view'

export const metadata: Metadata = {
  title: 'Write a post',
  robots: NO_INDEX,
}

const PostNewPage = () => {
  return <PostNewView />
}

export default PostNewPage
