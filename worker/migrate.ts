import { PgBoss } from 'pg-boss'

/**
 * Installs or upgrades the `pgboss` schema and exits, without creating queues or working jobs.
 * `db:test:prepare` runs it so the test database has the schema before any test enqueues.
 */
const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const boss = new PgBoss({ connectionString, supervise: false, schedule: false })
boss.on('error', (error) => console.error('[pgboss]', error))
await boss.start()
await boss.stop({ graceful: true })
console.log('pgboss schema is up to date')
