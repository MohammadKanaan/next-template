import Link from 'next/link'
import styles from './styles.module.scss'

const numberFormat = new Intl.NumberFormat('en-US')

type StatCardProps = {
  label: string
  value: number
  /** A short line under the value, e.g. "2 without a poster". */
  hint?: string
  /** Makes the whole card a link, e.g. to the list the number counts. */
  href?: string
}

/** One number of the dashboard overview. */
export const StatCard = ({ label, value, hint, href }: StatCardProps) => {
  const body = (
    <>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{numberFormat.format(value)}</span>
      {hint && <span className={styles.hint}>{hint}</span>}
    </>
  )
  if (href) {
    return (
      <Link href={href} className={`${styles.card} ${styles.link}`}>
        {body}
      </Link>
    )
  }
  return <div className={styles.card}>{body}</div>
}
