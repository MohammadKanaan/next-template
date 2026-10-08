import { auth } from '@/lib/data/auth'
import { db } from '@/lib/data/db'
import type { Role } from '@/lib/dto/users'
import { getRedis } from '@/lib/server/redis'
import { cookieJar } from './cookies'

export const TEST_PASSWORD = 'correct-horse-battery'

export const assertTestDatabase = () => {
  if (!process.env.DATABASE_URL?.includes('next_template_test')) {
    throw new Error('Server tests must run against next_template_test')
  }
}

/** Tests share Redis DB 15 only; anything else could hold real data. */
export const assertTestRedis = () => {
  if (!process.env.REDIS_URL?.endsWith('/15')) {
    throw new Error('Server tests must run against Redis database 15')
  }
}

/** Empties the test Redis (cache entries, tag versions, rate-limit counters). */
export const resetRedis = async () => {
  assertTestRedis()
  await getRedis().flushdb()
}

export const resetDatabase = async () => {
  assertTestDatabase()
  await resetRedis()
  cookieJar.clear()
  await db.$executeRaw`TRUNCATE TABLE posts, tags, sessions, accounts, verifications, audit_logs, users RESTART IDENTITY CASCADE`
}

/** Signs a user up through Better Auth (real password hash and account row), then signs out locally. */
export const createUser = async (
  overrides: Partial<{ name: string; username: string; email: string; role: Role }> = {},
) => {
  const suffix = Math.random().toString(36).slice(2, 8)
  const email = overrides.email ?? `${suffix}@example.com`
  await auth.api.signUpEmail({
    body: {
      name: overrides.name ?? `User ${suffix}`,
      username: overrides.username ?? `user_${suffix}`,
      email,
      password: TEST_PASSWORD,
    },
  })
  cookieJar.clear()
  return db.user.update({ where: { email }, data: { role: overrides.role ?? 'user' } })
}

export const signInAs = async (user: { email: string }) => {
  cookieJar.clear()
  await auth.api.signInEmail({ body: { email: user.email, password: TEST_PASSWORD } })
}

export const signOut = () => {
  cookieJar.clear()
}
