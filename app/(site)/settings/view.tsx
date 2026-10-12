'use client'

import { AtSign, Camera, KeyRound, MonitorSmartphone, TriangleAlert, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import {
  changeEmailAction,
  changePasswordAction,
  deleteAccountAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
} from '@/actions/auth'
import { attachAvatarAction, createUploadAction } from '@/actions/uploads'
import { updateProfileAction } from '@/actions/users'
import { AvatarUploader } from '@/components/Settings/AvatarUploader'
import { DeleteAccountDialog } from '@/components/Settings/DeleteAccountDialog'
import { EmailForm } from '@/components/Settings/EmailForm'
import { PasswordForm } from '@/components/Settings/PasswordForm'
import { ProfileForm } from '@/components/Settings/ProfileForm'
import { SessionList } from '@/components/Settings/SessionList'
import { SettingsNav, type SettingsNavItem } from '@/components/Settings/SettingsNav'
import { SettingsSection } from '@/components/Settings/SettingsSection'
import { ROUTE_FORGOT_PASSWORD, ROUTE_HOME } from '@/lib/constants-routes'
import type { ChangeEmailInput, ChangePasswordInput, DeleteAccountInput } from '@/lib/dto/auth'
import type { CurrentUser, SessionSummary, UpdateProfileInput } from '@/lib/dto/users'
import styles from './styles.module.scss'

type SettingsViewProps = {
  user: CurrentUser
  sessions: SessionSummary[]
  hasPassword: boolean
  /** Whether storage is configured; without it the photo card is not shown. */
  canUpload: boolean
}

/** One settings row; its id, title and icon also make its SettingsNav link. */
type Section = Pick<SettingsNavItem, 'id' | 'icon' | 'danger'> & {
  title: string
  description: ReactNode
  content: ReactNode
}

export const SettingsView = ({ user, sessions, hasPassword, canUpload }: SettingsViewProps) => {
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

  const sections: Section[] = [
    ...(canUpload
      ? [
          {
            id: 'photo',
            title: 'Profile photo',
            description: 'Shown in the navigation bar next to your name.',
            icon: Camera,
            content: (
              <AvatarUploader
                name={user.name}
                image={user.image}
                onCreateUpload={createUploadAction}
                onAttach={attachAvatarAction}
                onUploaded={() => toast.success('Profile photo updated')}
              />
            ),
          },
        ]
      : []),
    {
      id: 'profile',
      title: 'Profile',
      description: 'Your name, username, and website.',
      icon: UserRound,
      content: <ProfileForm user={user} onSubmit={handleProfile} />,
    },
    {
      id: 'email',
      title: 'Email',
      description: (
        <>
          Your email is <strong className={styles.email}>{user.email}</strong>. We email your
          current address to confirm a change, then the new address to verify it.
        </>
      ),
      icon: AtSign,
      content: <EmailForm onSubmit={handleEmail} />,
    },
    {
      id: 'password',
      title: 'Password',
      description: hasPassword
        ? 'Changing it signs out every other device.'
        : 'Your account has no password yet.',
      icon: KeyRound,
      content: hasPassword ? (
        <PasswordForm onSubmit={handlePassword} />
      ) : (
        <p className={styles.note}>
          You signed in with Google. To set a password, use{' '}
          <Link href={ROUTE_FORGOT_PASSWORD}>Forgot password</Link> with {user.email}: the emailed
          link creates one. It also signs you out everywhere, so you sign in again afterwards.
        </p>
      ),
    },
    {
      id: 'sessions',
      title: 'Sessions',
      description: 'The devices currently signed in to your account.',
      icon: MonitorSmartphone,
      content: (
        <SessionList
          sessions={sessions}
          onRevoke={handleRevoke}
          onRevokeOthers={handleRevokeOthers}
        />
      ),
    },
    {
      id: 'delete',
      title: 'Delete account',
      description: 'Permanently remove your account and your posts. This cannot be undone.',
      icon: TriangleAlert,
      danger: true,
      content: hasPassword ? (
        <DeleteAccountDialog onConfirm={handleDelete} />
      ) : (
        <p className={styles.note}>
          Deleting an account asks for its password, and yours has none yet. Set one with{' '}
          <Link href={ROUTE_FORGOT_PASSWORD}>Forgot password</Link> first.
        </p>
      ),
    },
  ]

  return (
    <div className={styles.layout}>
      <SettingsNav
        items={sections.map(({ id, title, icon, danger }) => ({ id, label: title, icon, danger }))}
      />
      <div className={styles.sections}>
        {sections.map(({ id, title, description, danger, content }) => (
          <SettingsSection key={id} id={id} title={title} description={description} danger={danger}>
            {content}
          </SettingsSection>
        ))}
      </div>
    </div>
  )
}
