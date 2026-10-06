import { NextResponse } from 'next/server'
import { createComment, listComments } from '@/lib/data/comments'
import { readJsonBody, toErrorResponse } from '@/lib/data/errors'

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
    const { id } = await context.params
    const comment = await createComment(id, await readJsonBody(request))
    return NextResponse.json(comment, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
