import { Card, CardContent } from '@/components/SCN/card'
import styles from './styles.module.scss'

type StatCardProps = {
  label: string
  value: number | string
  hint?: string
}

export const StatCard = ({ label, value, hint }: StatCardProps) => {
  return (
    <Card>
      <CardContent>
        <div className={styles.stat}>
          <p className={styles.label}>{label}</p>
          <p className={styles.value}>{value}</p>
          {hint && <p className={styles.hint}>{hint}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
