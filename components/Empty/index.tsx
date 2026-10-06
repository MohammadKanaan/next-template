import type { ReactNode } from 'react'
import styles from './styles.module.scss'

type EmptyProps = {
  title: string
  description?: string
  action?: ReactNode
}

export const Empty = ({ title, description, action }: EmptyProps) => {
  return (
    <div className={styles.empty}>
      <h2 className={styles.title}>{title}</h2>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
