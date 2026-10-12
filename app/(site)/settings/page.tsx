import type { Metadata } from 'next'
import { SettingsHeader } from '@/components/Settings/SettingsHeader'
import { ROUTE_SETTINGS } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { listSessions } from '@/lib/data/sessions'
import { canUpload } from '@/lib/data/uploads'
import { getCurrentUser, hasPassword } from '@/lib/data/users'
import { NO_INDEX } from '@/lib/seo'
import { SettingsView } from './view'
import styles from './styles.module.scss'

export const metadata: Metadata = {
  title: 'Settings',
  robots: NO_INDEX,
}

const SettingsPage = async () => {
  const [user, sessions, userHasPassword] = await loadPage(
    () => Promise.all([getCurrentUser(), listSessions(), hasPassword()]),
    ROUTE_SETTINGS,
  )

  return (
    <div className={styles.page}>
      <SettingsHeader user={user} />
      <SettingsView
        user={user}
        sessions={sessions}
        hasPassword={userHasPassword}
        canUpload={canUpload()}
      />
    </div>
  )
}

export default SettingsPage
