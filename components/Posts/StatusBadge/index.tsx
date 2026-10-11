import { Badge } from '@/components/SCN/badge'

type PostStatusBadgeProps = {
  published: boolean
}

export const PostStatusBadge = ({ published }: PostStatusBadgeProps) => {
  return published ? <Badge>Published</Badge> : <Badge variant="outline">Draft</Badge>
}
