'use client'

import { toast } from 'sonner'
import { attachAvatarAction, createAvatarUploadAction } from '@/actions/uploads'
import { AvatarUploader } from '@/components/Settings/AvatarUploader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/SCN/card'

type SettingsViewProps = {
  name: string
  image: string | null
}

export function SettingsView({ name, image }: SettingsViewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile photo</CardTitle>
        <CardDescription>Shown in the navigation bar next to your name.</CardDescription>
      </CardHeader>
      <CardContent>
        <AvatarUploader
          name={name}
          image={image}
          onCreateUpload={createAvatarUploadAction}
          onAttach={attachAvatarAction}
          onUploaded={() => toast.success('Profile photo updated')}
        />
      </CardContent>
    </Card>
  )
}
