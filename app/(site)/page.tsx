import { Button } from '@/components/SCN/button'
import { Spinner } from '@/components/SCN/spinner'
import styles from './home.module.scss'

export default function HomePage() {
  return (
    <section className={styles.landing}>
      <h1>Welcome</h1>
      <Button size="sm">
        <Spinner />
        Sowlutions
      </Button>
      <p>A minimal Next.js starter with shadcn/ui, Prisma, and a typed API layer.</p>
    </section>
  )
}
