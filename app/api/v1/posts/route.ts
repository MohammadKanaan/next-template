import { NextResponse } from 'next/server'
import { parseInput, toErrorResponse } from '@/lib/data/errors'
import { listPosts } from '@/lib/data/posts'
import { listPostsQuery } from '@/lib/dto/posts'

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
