import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/data/auth'
import { createComment, listComments } from '@/lib/data/comments'
import { parseInput, readJsonBody, toErrorResponse } from '@/lib/data/errors'
import { createCommentInput } from '@/lib/dto/comments'

export const GET = async (
  _request: Request,
  context: RouteContext<'/api/v1/posts/[id]/comments'>,
) => {
  try {
    const { id } = await context.params
    return NextResponse.json(await listComments(id))
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
