'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  changeEmailAction,
  changePasswordAction,
  deleteAccountAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
} from '@/actions/auth'
import { attachAvatarAction, createAvatarUploadAction } from '@/actions/uploads'
import { updateProfileAction } from '@/actions/users'
import { DeleteAccountDialog } from '@/components/Settings/DeleteAccountDialog'
import { AvatarUploader } from '@/components/Settings/AvatarUploader'
import { EmailForm } from '@/components/Settings/EmailForm'
import { PasswordForm } from '@/components/Settings/PasswordForm'
import { ProfileForm } from '@/components/Settings/ProfileForm'
import { SessionList } from '@/components/Settings/SessionList'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/SCN/card'
import { ROUTE_HOME } from '@/lib/constants-routes'
import type { ChangeEmailInput, ChangePasswordInput, DeleteAccountInput } from '@/lib/dto/auth'
import type { CurrentUser, SessionSummary, UpdateProfileInput } from '@/lib/dto/users'
import styles from './styles.module.scss'

type SettingsViewProps = {
  user: CurrentUser
  sessions: SessionSummary[]
}

export const SettingsView = ({ user, sessions }: SettingsViewProps) => {
  const router = useRouter()

  const handleProfile = async (values: UpdateProfileInput) => {
    const result = await updateProfileAction(values)
    if (result.ok) {
      toast.success('Profile updated')
    }
    return result
  }

  const handleEmail = async (values: ChangeEmailInput) => {
    const result = await changeEmailAction(values)
    if (result.ok) {
      toast.success('Check your inbox', {
        description: 'Follow the emails we sent to finish changing your address.',
      })
    }
    return result
  }

  const handlePassword = async (values: ChangePasswordInput) => {
    const result = await changePasswordAction(values)
    if (result.ok) {
      toast.success('Password changed', { description: 'Your other devices were signed out.' })
    }
    return result
  }

  const handleRevoke = async (id: string) => {
    const result = await revokeSessionAction(id)
    if (result.ok) {
      toast.success('Device signed out')
    }
    return result
  }

  const handleRevokeOthers = async () => {
    const result = await revokeOtherSessionsAction()
    if (result.ok) {
      toast.success('Other devices signed out')
    }
    return result
  }

  const handleDelete = async (values: DeleteAccountInput) => {
    const result = await deleteAccountAction(values)
    if (result.ok) {
      toast.success('Account deleted')
      router.push(ROUTE_HOME)
    }
    return result
  }

  return (
    <div className={styles.stack}>
      <Card>
        <CardHeader>
          <CardTitle>Profile photo</CardTitle>
          <CardDescription>Shown in the navigation bar next to your name.</CardDescription>
        </CardHeader>
        <CardContent>
          <AvatarUploader
            name={user.name}
            image={user.image}
            onCreateUpload={createAvatarUploadAction}
            onAttach={attachAvatarAction}
            onUploaded={() => toast.success('Profile photo updated')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your name, username, and website.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm user={user} onSubmit={handleProfile} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>
            Your email is {user.email}. We email your current address to confirm a change, then the
            new address to verify it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmailForm onSubmit={handleEmail} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Changing it signs out every other device.</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm onSubmit={handlePassword} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>The devices currently signed in to your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <SessionList
            sessions={sessions}
            onRevoke={handleRevoke}
            onRevokeOthers={handleRevokeOthers}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>
            Permanently remove your account, posts, and uploads. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountDialog onConfirm={handleDelete} />
        </CardContent>
      </Card>
    </div>
  )
}
