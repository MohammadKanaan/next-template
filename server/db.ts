import 'server-only'
import postgres from '@prisma/orm-postgres/runtime'
import type { Contract } from '@/prisma/contract.d'
import contractJson from '@/prisma/contract.json' with { type: 'json' }

function createClient() {
  return postgres<Contract>({ contractJson, url: process.env.DATABASE_URL })
}

const globalForDb = globalThis as unknown as { db?: ReturnType<typeof createClient> }

export const db = globalForDb.db ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForDb.db = db
}
