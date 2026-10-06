'use server'

import { revalidatePath } from 'next/cache'
import { ROUTE_POSTS } from '@/lib/constants-routes'
import { toActionFailure } from '@/lib/data/errors'
import { createPost, deletePost, updatePost } from '@/lib/data/posts'
import type { CreatePostInput, PostDetail, UpdatePostInput } from '@/lib/dto/posts'
import type { ActionResult } from '@/types/api'

export const createPostAction = async (
  input: CreatePostInput,
): Promise<ActionResult<PostDetail>> => {
  try {
    const post = await createPost(input)
    revalidatePath(ROUTE_POSTS, 'layout')
    return { ok: true, data: post }
  } catch (error) {
    return toActionFailure(error)
  }
}

export const updatePostAction = async (
  id: number,
  input: UpdatePostInput,
): Promise<ActionResult<PostDetail>> => {
  try {
    const post = await updatePost(id, input)
    revalidatePath(ROUTE_POSTS, 'layout')
    return { ok: true, data: post }
  } catch (error) {
    return toActionFailure(error)
  }
}

export const deletePostAction = async (id: number): Promise<ActionResult<null>> => {
  try {
    await deletePost(id)
    revalidatePath(ROUTE_POSTS, 'layout')
    return { ok: true, data: null }
  } catch (error) {
    return toActionFailure(error)
  }
}
