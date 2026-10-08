'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { updatePostAction } from '@/actions/posts'
import {
  attachPostUploadAction,
  createUploadAction,
  detachPostUploadAction,
} from '@/actions/uploads'
import { PageHeader } from '@/components/PageHeader'
import { PostAttachments } from '@/components/Posts/Attachments'
import { PostForm } from '@/components/Posts/Form'
import { buildPostAttributes } from '@/components/Posts/Form/utils'
import { Button } from '@/components/SCN/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/SCN/card'
import { ROUTE_POST_DETAILS } from '@/lib/constants-routes'
import type { PostDetail, PostFormInput } from '@/lib/dto/posts'
import styles from '../styles.module.scss'

type PostEditViewProps = {
  post: PostDetail
}

export const PostEditView = ({ post }: PostEditViewProps) => {
  const router = useRouter()
  const [conflict, setConflict] = useState(false)

  const handleSubmit = async (values: PostFormInput) => {
    setConflict(false)
    const attributes = buildPostAttributes(values, post)

    if (Object.keys(attributes).length === 0) {
      toast('No changes to save')
      return { ok: true, data: null } as const
    }

    const result = await updatePostAction(post.id, {
      ...attributes,
      version: values.version ?? post.version,
    })
    if (!result.ok) {
      setConflict(result.code === 'CONFLICT')
    }
    if (result.ok) {
      toast.success('Post updated')
      router.push(ROUTE_POST_DETAILS(result.data.author.id, result.data.id))
    }
    return result
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Edit post" description="Update the title or body." />
      <PostForm
        post={post}
        submitLabel="Save changes"
        onCancel={() => router.push(ROUTE_POST_DETAILS(post.author.id, post.id))}
        onSubmit={handleSubmit}
        errorAction={
          conflict && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                // Reloads the post: the form then shows the saved version with its new `version`.
                setConflict(false)
                router.refresh()
              }}
            >
              Reload
            </Button>
          )
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Attachments</CardTitle>
          <CardDescription>
            Files are added or removed at once; they do not wait for Save changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PostAttachments
            attachments={post.attachments}
            onCreateUpload={createUploadAction}
            onAttach={(uploadId) => attachPostUploadAction(post.id, uploadId)}
            onDetach={(uploadId) => detachPostUploadAction(post.id, uploadId)}
            onChanged={() => router.refresh()}
          />
        </CardContent>
      </Card>
    </div>
  )
}
