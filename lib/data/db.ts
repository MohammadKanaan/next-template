import 'server-only'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

const createClient = () => {
  return new PrismaClient({
    // The session runs in UTC: the adapter writes and reads `timestamptz` as wall-clock values in
    // the session time zone, so a server in another zone would store shifted instants, and raw SQL
    // that groups by UTC day would disagree with what Prisma returns. The seed does the same.
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      options: '-c timezone=UTC',
    }),
  })
}

const globalForDb = globalThis as unknown as { db?: PrismaClient }

export const db = globalForDb.db ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForDb.db = db
}
