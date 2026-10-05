import Link from 'next/link'
import { ROUTE_POST_DETAILS } from '@/lib/constants-routes'
import type { PostResponse } from '@/services/PostsService'
import styles from './styles.module.scss'

type PostsCardProps = {
  post: PostResponse
  maxBodyChars?: number
}

function truncate(body: string, maxChars: number) {
  return body.length <= maxChars ? body : `${body.slice(0, maxChars).trimEnd()}…`
}

export function PostsCard({ post, maxBodyChars = 160 }: PostsCardProps) {
  const body = truncate(post.body, maxBodyChars)

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.title}>{post.title}</h3>
        <span className={styles.pill}>#{post.id}</span>
      </div>

      {body && <p className={styles.body}>{body}</p>}

      <div className={styles.actions}>
        <Link href={ROUTE_POST_DETAILS(post.userId, post.id)} className={styles.link}>
          View
        </Link>
      </div>
    </article>
  )
}
