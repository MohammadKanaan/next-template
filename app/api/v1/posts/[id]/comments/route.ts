import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/data/auth'
import { createComment, listComments } from '@/lib/data/comments'
import { parseInput, readJsonBody, toErrorResponse } from '@/lib/data/errors'
import { createCommentInput } from '@/lib/dto/comments'
import { cursorQuerySchema } from '@/lib/dto/common'

export const GET = async (
  request: Request,
  context: RouteContext<'/api/v1/posts/[id]/comments'>,
) => {
  try {
    const { id } = await context.params
    const { searchParams } = new URL(request.url)
    // Decodes the query string (every value arrives as a string); the DAL validates again.
    const query = parseInput(cursorQuerySchema, Object.fromEntries(searchParams))
    return NextResponse.json(await listComments(id, query))
  } catch (error) {
    return toErrorResponse(error)
  }
}

export const POST = async (
  request: Request,
  context: RouteContext<'/api/v1/posts/[id]/comments'>,
) => {
  try {
    // Signed in (401) comes before the body is read or decoded (422).
    await requireUser()
    const { id } = await context.params
    const comment = await createComment(
      id,
      parseInput(createCommentInput, await readJsonBody(request)),
    )
    return NextResponse.json(comment, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
