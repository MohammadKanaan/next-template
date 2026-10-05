import { loginSchema } from '@/lib/validation/auth'
import { endSession, getCurrentSession, startSession } from '@/server/auth'
import { fail, invalid, ok, readJson } from '@/server/http'
import { findUserByEmail } from '@/server/repositories/users'
import { serializeCurrentUser } from '@/server/serializers/user'

export async function POST(request: Request) {
  const body = await readJson(request)
  const parsed = loginSchema.safeParse(body.session ?? {})
  if (!parsed.success) {
    return invalid(parsed.error)
  }
  const user = await findUserByEmail(parsed.data.email)
  if (!user) {
    return fail(401, 'No account found for that email')
  }
  const { expiresAt } = await startSession(user.id)
  return ok({ user: serializeCurrentUser(user), expires_at: expiresAt.toISOString() }, 201)
}

export async function GET(_request: Request) {
  const session = await getCurrentSession()
  if (!session) {
    return fail(401, 'Sign in to continue')
  }
  return ok({
    user: serializeCurrentUser(session.user),
    expires_at: session.expiresAt.toISOString(),
  })
}

export async function DELETE(_request: Request) {
  await endSession()
  return ok(null)
}
