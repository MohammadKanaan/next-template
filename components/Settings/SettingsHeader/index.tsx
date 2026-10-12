import { ROLE_LABELS } from '@/components/Admin/Users/roles'
import { UserAvatar } from '@/components/UserAvatar'
import type { CurrentUser } from '@/lib/dto/users'
import styles from './styles.module.scss'

type SettingsHeaderProps = {
  user: CurrentUser
}

/** The settings page title, with who is signed in. */
export const SettingsHeader = ({ user }: SettingsHeaderProps) => {
  return (
    <header className={styles.header}>
      <UserAvatar name={user.name} image={user.image} size="lg" />
      <div className={styles.text}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>
          Signed in as <strong>{user.name}</strong> · @{user.username} · {ROLE_LABELS[user.role]}
        </p>
      </div>
    </header>
  )
}
