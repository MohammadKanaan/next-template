import { PostsCard } from '@/components/Posts/Card'
import type { PostResponse } from '@/services/PostsService'
import styles from './styles.module.scss'

type PostsGridProps = {
  posts: PostResponse[]
}

export function PostsGrid({ posts }: PostsGridProps) {
  return (
    <div className={styles.grid}>
      {posts.map((post) => (
        <PostsCard key={post.id} post={post} />
      ))}
    </div>
  )
}
