import type { ReactNode } from 'react'
import styles from './styles.module.scss'

type ActionGroupProps = {
  /** Names the group for assistive tech, e.g. "Review actions". */
  label: string
  /** `ActionButton`s and `ActionLink`s, in the order view, edit, delete. */
  children: ReactNode
}

/**
 * Where a record's actions live: a row of icon buttons pushed to the end of its container (the
 * right of a card's header, a comment's byline or a table row), so they are always found there.
 */
export const ActionGroup = ({ label, children }: ActionGroupProps) => {
  return (
    <div className={styles.group} role="group" aria-label={label}>
      {children}
    </div>
  )
}
