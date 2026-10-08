'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  changeEmailAction,
  changePasswordAction,
  deleteAccountAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
} from '@/actions/auth'
import { subscribePushAction, unsubscribePushAction } from '@/actions/push'
import { attachAvatarAction, createUploadAction } from '@/actions/uploads'
import { updateProfileAction } from '@/actions/users'
import { DeleteAccountDialog } from '@/components/Settings/DeleteAccountDialog'
import { AvatarUploader } from '@/components/Settings/AvatarUploader'
import { EmailForm } from '@/components/Settings/EmailForm'
import { PasswordForm } from '@/components/Settings/PasswordForm'
import { ProfileForm } from '@/components/Settings/ProfileForm'
import { PushSettings } from '@/components/Settings/PushSettings'
import { SessionList } from '@/components/Settings/SessionList'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/SCN/card'
import { ROUTE_FORGOT_PASSWORD, ROUTE_HOME } from '@/lib/constants-routes'
import type { ChangeEmailInput, ChangePasswordInput, DeleteAccountInput } from '@/lib/dto/auth'
import type { PushConfig } from '@/lib/dto/push'
import type { CurrentUser, SessionSummary, UpdateProfileInput } from '@/lib/dto/users'
import styles from './styles.module.scss'

type SettingsViewProps = {
  user: CurrentUser
  sessions: SessionSummary[]
  hasPassword: boolean
  /** The VAPID public key, or null when Web Push is not configured. */
  pushConfig: PushConfig | null
}

export const SettingsView = ({ user, sessions, hasPassword, pushConfig }: SettingsViewProps) => {
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
            onCreateUpload={createUploadAction}
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
          <CardDescription>
            {hasPassword
              ? 'Changing it signs out every other device.'
              : 'Your account has no password yet.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasPassword ? (
            <PasswordForm onSubmit={handlePassword} />
          ) : (
            <p className={styles.note}>
              You signed in with Google. To set a password, use{' '}
              <Link href={ROUTE_FORGOT_PASSWORD}>Forgot password</Link> with {user.email}: the
              emailed link creates one. It also signs you out everywhere, so you sign in again
              afterwards.
            </p>
          )}
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

      {pushConfig && (
        <Card>
          <CardHeader>
            <CardTitle>Browser notifications</CardTitle>
            <CardDescription>
              Per browser. The bell in the navigation works everywhere; this adds a system
              notification when no tab is open.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PushSettings
              publicKey={pushConfig.publicKey}
              onSubscribe={subscribePushAction}
              onUnsubscribe={unsubscribePushAction}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>
            Permanently remove your account, posts, and uploads. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasPassword ? (
            <DeleteAccountDialog onConfirm={handleDelete} />
          ) : (
            <p className={styles.note}>
              Deleting an account asks for its password, and yours has none yet. Set one with{' '}
              <Link href={ROUTE_FORGOT_PASSWORD}>Forgot password</Link> first.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
