import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/data/auth'
import { parseInput, readJsonBody, toErrorResponse } from '@/lib/data/errors'
import { deletePost, getPost, updatePost } from '@/lib/data/posts'
import { updatePostInput } from '@/lib/dto/posts'

export const GET = async (_request: Request, context: RouteContext<'/api/v1/posts/[id]'>) => {
  try {
    // The raw route param goes to the DAL, which validates it.
    const { id } = await context.params
    return NextResponse.json(await getPost(id))
  } catch (error) {
    return toErrorResponse(error)
  }
}

export const PATCH = async (request: Request, context: RouteContext<'/api/v1/posts/[id]'>) => {
  try {
    // Signed in (401) comes before the body is read or decoded (422).
    await requireUser()
    const { id } = await context.params
    return NextResponse.json(
      await updatePost(id, parseInput(updatePostInput, await readJsonBody(request))),
    )
  } catch (error) {
    return toErrorResponse(error)
  }
}

export const DELETE = async (_request: Request, context: RouteContext<'/api/v1/posts/[id]'>) => {
  try {
    const { id } = await context.params
    await deletePost(id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
