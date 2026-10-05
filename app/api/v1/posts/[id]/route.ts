import { updatePostSchema } from '@/lib/validation/posts'
import { getCurrentSession } from '@/server/auth'
import { fail, invalid, ok, parseId, readJson } from '@/server/http'
import { deletePost, findPost, updatePost } from '@/server/repositories/posts'
import { serializePostDetailed } from '@/server/serializers/post'

type Context = { params: Promise<{ id: string }> }

async function loadOwnedPost(context: Context) {
  const id = parseId((await context.params).id)
  const post = id ? await findPost(id) : null
  if (!post) {
    return { ok: false, error: fail(404, 'Post not found') } as const
  }
  const session = await getCurrentSession()
  if (!session) {
    return { ok: false, error: fail(401, 'Sign in to continue') } as const
  }
  if (session.userId !== post.userId) {
    return { ok: false, error: fail(403, 'You cannot change this post') } as const
  }
  return { ok: true, post, session } as const
}

export async function GET(_request: Request, context: Context) {
  const id = parseId((await context.params).id)
  const post = id ? await findPost(id) : null
  if (!post) {
    return fail(404, 'Post not found')
  }
  const session = await getCurrentSession()
  return ok(serializePostDetailed(post, session?.userId ?? null))
}

export async function PATCH(request: Request, context: Context) {
  const result = await loadOwnedPost(context)
  if (!result.ok) {
    return result.error
  }
  const body = await readJson(request)
  const parsed = updatePostSchema.safeParse(body.post ?? {})
  if (!parsed.success) {
    return invalid(parsed.error)
  }
  const post = await updatePost(result.post.id, parsed.data)
  return ok(serializePostDetailed(post, result.session.userId))
}

export async function DELETE(_request: Request, context: Context) {
  const result = await loadOwnedPost(context)
  if (!result.ok) {
    return result.error
  }
  await deletePost(result.post.id)
  return ok(null)
}
