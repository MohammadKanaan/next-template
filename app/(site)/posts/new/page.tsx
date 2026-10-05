import type { Metadata } from 'next'
import { PostNewView } from './view'

export const metadata: Metadata = {
  title: 'Write a post',
}

export default function PostNewPage() {
  return <PostNewView />
}
