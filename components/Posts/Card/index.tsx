import Link from 'next/link'
import { ROUTE_POST_DETAILS } from '@/lib/constants-routes'
import type { PostSummary } from '@/lib/dto/posts'
import styles from './styles.module.scss'

type PostsCardProps = {
  post: PostSummary
}

export function PostsCard({ post }: PostsCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.title}>{post.title}</h3>
        <span className={styles.pill}>#{post.id}</span>
      </div>

      {post.excerpt && <p className={styles.body}>{post.excerpt}</p>}

      <p className={styles.byline}>by {post.author.name}</p>

      <div className={styles.actions}>
        <Link href={ROUTE_POST_DETAILS(post.author.id, post.id)} className={styles.link}>
          View
        </Link>
      </div>
    </article>
  )
}
