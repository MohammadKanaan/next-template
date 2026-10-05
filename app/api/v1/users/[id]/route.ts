import { fail, ok, parseId } from '@/server/http'
import { findUser } from '@/server/repositories/users'
import { serializeUser } from '@/server/serializers/user'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: Context) {
  const id = parseId((await context.params).id)
  const user = id ? await findUser(id) : null
  if (!user) {
    return fail(404, 'User not found')
  }
  return ok(serializeUser(user))
}
