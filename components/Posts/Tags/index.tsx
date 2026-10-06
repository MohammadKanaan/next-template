import { Badge } from '@/components/SCN/badge'
import styles from './styles.module.scss'

type PostTagsProps = {
  tags: string[]
}

export const PostTags = ({ tags }: PostTagsProps) => {
  if (tags.length === 0) {
    return null
  }
  return (
    <ul className={styles.tags} aria-label="Tags">
      {tags.map((tag) => (
        <li key={tag}>
          <Badge variant="outline">{tag}</Badge>
        </li>
      ))}
    </ul>
  )
}
