import { NextResponse } from 'next/server'
import { readJsonBody, toErrorResponse } from '@/lib/data/errors'
import { deletePost, getPost, updatePost } from '@/lib/data/posts'

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
    const { id } = await context.params
    return NextResponse.json(await updatePost(id, await readJsonBody(request)))
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
