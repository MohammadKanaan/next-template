import { Avatar, AvatarFallback, AvatarImage } from '@/components/SCN/avatar'
import { getInitials } from '@/lib/getInitials'

type UserAvatarProps = {
  name: string
  image: string | null
  size?: 'default' | 'sm' | 'lg'
}

/** A user's picture, falling back to their initials while it loads or when there is none. */
export const UserAvatar = ({ name, image, size = 'default' }: UserAvatarProps) => {
  return (
    <Avatar size={size}>
      <AvatarImage src={image ?? undefined} alt="" />
      <AvatarFallback>{getInitials(name)}</AvatarFallback>
    </Avatar>
  )
}
