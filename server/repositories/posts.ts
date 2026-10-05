import 'server-only'
import { db } from '@/server/db'

export async function listPosts(options: { skip: number; take: number; userId?: number }) {
  const scope = options.userId
    ? db.orm.public.Post.where({ userId: options.userId })
    : db.orm.public.Post
  const [posts, { totalCount }] = await Promise.all([
    scope
      .orderBy((post) => post.id.desc())
      .offset(options.skip)
      .limit(options.take)
      .all(),
    scope.aggregate((aggregate) => ({ totalCount: aggregate.count() })),
  ])
  return { posts, totalCount }
}

export function findPost(id: number) {
  return db.orm.public.Post.where({ id }).include('user').first()
}

async function findPostOrThrow(id: number) {
  const post = await findPost(id)
  if (!post) {
    throw new Error(`Post ${id} disappeared during the request`)
  }
  return post
}

export async function createPost(userId: number, data: { title: string; body: string }) {
  const post = await db.orm.public.Post.create({ ...data, userId })
  return findPostOrThrow(post.id)
}

export async function updatePost(id: number, data: { title?: string; body?: string }) {
  await db.orm.public.Post.where({ id }).update(data)
  return findPostOrThrow(id)
}

export function deletePost(id: number) {
  return db.orm.public.Post.where({ id }).delete()
}
