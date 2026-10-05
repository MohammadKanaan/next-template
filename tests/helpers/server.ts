import { db } from '@/lib/data/db'

export function assertTestDatabase() {
  if (!process.env.DATABASE_URL?.includes('next_template_test')) {
    throw new Error('Server tests must run against next_template_test')
  }
}

export async function resetDatabase() {
  assertTestDatabase()
  await db.$executeRaw`TRUNCATE TABLE posts, sessions, accounts, verifications, users RESTART IDENTITY CASCADE`
}
