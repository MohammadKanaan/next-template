'use server'

import { revalidatePath } from 'next/cache'
import { ROUTE_POSTS } from '@/lib/constants-routes'
import { createComment, deleteComment } from '@/lib/data/comments'
import { toActionFailure } from '@/lib/data/errors'
import type { Comment, CreateCommentInput } from '@/lib/dto/comments'
import type { ActionResult } from '@/types/api'

export const createCommentAction = async (
  postId: number,
  input: CreateCommentInput,
): Promise<ActionResult<Comment>> => {
  try {
    const comment = await createComment(postId, input)
    revalidatePath(ROUTE_POSTS, 'layout')
    return { ok: true, data: comment }
  } catch (error) {
    return toActionFailure(error)
  }
}

export const deleteCommentAction = async (id: number): Promise<ActionResult<null>> => {
  try {
    await deleteComment(id)
    revalidatePath(ROUTE_POSTS, 'layout')
    return { ok: true, data: null }
  } catch (error) {
    return toActionFailure(error)
  }
}
