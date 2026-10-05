import 'dotenv/config'
import postgres from '@prisma/orm-postgres/runtime'
import type { Contract } from './contract.d.ts'
import contractJson from './contract.json' with { type: 'json' }

const url = process.env.DATABASE_URL

if (!url?.includes('next_template_test')) {
  throw new Error('Refusing to reset: DATABASE_URL must point at next_template_test')
}

// Drops everything Prisma and the app created so migrations can be replayed from scratch.
const db = postgres<Contract>({ contractJson, url })

try {
  const runtime = db.runtime()
  await runtime.execute(db.raw.sql`DROP SCHEMA IF EXISTS public CASCADE`.affectedCount().build())
  await runtime.execute(
    db.raw.sql`DROP SCHEMA IF EXISTS prisma_contract CASCADE`.affectedCount().build(),
  )
} finally {
  await db.close()
}
