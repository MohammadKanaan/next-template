import { getCurrentSession } from '@/server/auth'
import { fail, ok } from '@/server/http'
import { serializeCurrentUser } from '@/server/serializers/user'

export async function GET(_request: Request) {
  const session = await getCurrentSession()
  if (!session) {
    return fail(401, 'Sign in to continue')
  }
  return ok({ user: serializeCurrentUser(session.user) })
}
