import { db } from '@/server/db'

export const cookieJar = new Map<string, string>()

export const cookieStore = {
  get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
  set: (name: string, value: string) => {
    cookieJar.set(name, value)
  },
  delete: (name: string) => {
    cookieJar.delete(name)
  },
}

export function assertTestDatabase() {
  if (!process.env.DATABASE_URL?.includes('next_template_test')) {
    throw new Error('Server tests must run against next_template_test')
  }
}

export async function resetDatabase() {
  assertTestDatabase()
  cookieJar.clear()
  await db
    .runtime()
    .execute(
      db.raw.sql`TRUNCATE TABLE sessions, posts, users RESTART IDENTITY CASCADE`
        .affectedCount()
        .build(),
    )
}

export function createUser(overrides: Partial<{ name: string; username: string; email: string }>) {
  const suffix = Math.random().toString(36).slice(2, 8)
  return db.orm.public.User.create({
    name: overrides.name ?? `User ${suffix}`,
    username: overrides.username ?? `user_${suffix}`,
    email: overrides.email ?? `${suffix}@example.com`,
  })
}

export function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) }
}
