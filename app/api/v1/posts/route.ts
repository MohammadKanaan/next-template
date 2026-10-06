import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/data/auth'
import { parseInput, readJsonBody, toErrorResponse } from '@/lib/data/errors'
import { createPost, listPosts } from '@/lib/data/posts'
import { createPostInput, listPostsQuery } from '@/lib/dto/posts'

export const GET = async (request: Request) => {
  try {
    const { searchParams } = new URL(request.url)
    // Decodes the query string (every value arrives as a string); `listPosts` validates again.
    const query = parseInput(listPostsQuery, Object.fromEntries(searchParams))
    return NextResponse.json(await listPosts(query))
  } catch (error) {
    return toErrorResponse(error)
  }
}

export const POST = async (request: Request) => {
  try {
    // Signed in (401) comes before the body is read or decoded (422).
    await requireUser()
    const post = await createPost(parseInput(createPostInput, await readJsonBody(request)))
    return NextResponse.json(post, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
