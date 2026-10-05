import { postFormSchema } from '@/lib/validation/posts'
import { getCurrentSession } from '@/server/auth'
import { fail, invalid, ok, parseId, parsePagination, readJson, toListing } from '@/server/http'
import { createPost, listPosts } from '@/server/repositories/posts'
import { serializePost, serializePostDetailed } from '@/server/serializers/post'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const { page, perPage, skip } = parsePagination(searchParams)
  const userIdParam = searchParams.get('userId')
  const userId = userIdParam === null ? null : parseId(userIdParam)

  const [{ posts, totalCount }, session] = await Promise.all([
    listPosts({ skip, take: perPage, userId: userId ?? undefined }),
    getCurrentSession(),
  ])
  const viewerId = session?.userId ?? null

  return ok(
    toListing(
      posts.map((post) => serializePost(post, viewerId)),
      totalCount,
      page,
      perPage,
    ),
  )
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) {
    return fail(401, 'Sign in to continue')
  }
  const body = await readJson(request)
  const parsed = postFormSchema.safeParse(body.post ?? {})
  if (!parsed.success) {
    return invalid(parsed.error)
  }
  const post = await createPost(session.userId, parsed.data)
  return ok(serializePostDetailed(post, session.userId), 201)
}
