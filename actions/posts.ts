'use server'

import { revalidatePath } from 'next/cache'
import { ROUTE_POSTS } from '@/lib/constants-routes'
import { parseInput, toActionFailure } from '@/lib/data/errors'
import { createPost, deletePost, updatePost } from '@/lib/data/posts'
import { idSchema } from '@/lib/dto/common'
import {
  createPostInput,
  updatePostInput,
  type CreatePostInput,
  type PostDetail,
  type UpdatePostInput,
} from '@/lib/dto/posts'
import type { ActionResult } from '@/types/api'

export async function createPostAction(input: CreatePostInput): Promise<ActionResult<PostDetail>> {
  try {
    const post = await createPost(parseInput(createPostInput, input))
    revalidatePath(ROUTE_POSTS, 'layout')
    return { ok: true, data: post }
  } catch (error) {
    return toActionFailure(error)
  }
}

export async function updatePostAction(
  id: number,
  input: UpdatePostInput,
): Promise<ActionResult<PostDetail>> {
  try {
    const post = await updatePost(parseInput(idSchema, id), parseInput(updatePostInput, input))
    revalidatePath(ROUTE_POSTS, 'layout')
    return { ok: true, data: post }
  } catch (error) {
    return toActionFailure(error)
  }
}

export async function deletePostAction(id: number): Promise<ActionResult<null>> {
  try {
    await deletePost(parseInput(idSchema, id))
    revalidatePath(ROUTE_POSTS, 'layout')
    return { ok: true, data: null }
  } catch (error) {
    return toActionFailure(error)
  }
}
