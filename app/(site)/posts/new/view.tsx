'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createPostAction } from '@/actions/posts'
import { PageHeader } from '@/components/PageHeader'
import { PostForm } from '@/components/Posts/Form'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { ROUTE_POST_DETAILS, ROUTE_POSTS } from '@/lib/constants-routes'
import { postDraftSchema, type CreatePostInput, type PostDraft } from '@/lib/dto/posts'
import styles from '../styles.module.scss'

const DRAFT_STORAGE_KEY = 'post-draft:v1'

export function PostNewView() {
  const router = useRouter()
  const {
    value: draft,
    setValue: saveDraft,
    removeValue: clearDraft,
  } = useLocalStorage(DRAFT_STORAGE_KEY, postDraftSchema)

  const handleDraftChange = (next: PostDraft | null) => {
    if (next) {
      saveDraft(next)
    } else {
      clearDraft()
    }
  }

  const handleSubmit = async (values: CreatePostInput) => {
    const result = await createPostAction(values)
    if (result.ok) {
      clearDraft()
      toast.success('Post created')
      router.push(ROUTE_POST_DETAILS(result.data.author.id, result.data.id))
    }
    return result
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Write a post" description="Share something with everyone." />
      <PostForm
        post={null}
        draft={draft}
        onDraftChange={handleDraftChange}
        submitLabel="Create post"
        onCancel={() => router.push(ROUTE_POSTS)}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
