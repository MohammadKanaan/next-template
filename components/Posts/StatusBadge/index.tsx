import type { ComponentProps } from 'react'
import { Badge } from '@/components/SCN/badge'
import type { PostStatus } from '@/lib/dto/posts'

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>['variant']>

const STATUS_BADGES: Record<PostStatus, { label: string; variant: BadgeVariant }> = {
  draft: { label: 'Draft', variant: 'outline' },
  published: { label: 'Published', variant: 'default' },
  archived: { label: 'Archived', variant: 'secondary' },
}

type PostStatusBadgeProps = {
  status: PostStatus
}

export const PostStatusBadge = ({ status }: PostStatusBadgeProps) => {
  const { label, variant } = STATUS_BADGES[status]
  return <Badge variant={variant}>{label}</Badge>
}
