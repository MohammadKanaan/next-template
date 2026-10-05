import styles from './home.module.scss'

export default function HomePage() {
  return (
    <section className={styles.landing}>
      <h1>Welcome</h1>
      <p>A minimal Next.js starter with shadcn/ui, Prisma, and a typed API layer.</p>
    </section>
  )
}
