import 'server-only'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

const createClient = () => {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  })
}

const globalForDb = globalThis as unknown as { db?: PrismaClient }

export const db = globalForDb.db ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForDb.db = db
}
