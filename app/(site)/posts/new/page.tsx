import type { Metadata } from 'next'
import { PostNewView } from './view'

export const metadata: Metadata = {
  title: 'Write a post',
}

const PostNewPage = () => {
  return <PostNewView />
}

export default PostNewPage
