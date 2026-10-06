import { PostsCard } from '@/components/Posts/Card'
import type { PostSummary } from '@/lib/dto/posts'
import styles from './styles.module.scss'

type PostsGridProps = {
  posts: PostSummary[]
}

export const PostsGrid = ({ posts }: PostsGridProps) => {
  return (
    <div className={styles.grid}>
      {posts.map((post) => (
        <PostsCard key={post.id} post={post} />
      ))}
    </div>
  )
}
