import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { ROUTE_SETTINGS } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { listSessions } from '@/lib/data/sessions'
import { getCurrentUser, hasPassword } from '@/lib/data/users'
import { SettingsView } from './view'
import styles from './styles.module.scss'

export const metadata: Metadata = {
  title: 'Settings',
}

const SettingsPage = async () => {
  const [user, sessions, userHasPassword] = await loadPage(
    () => Promise.all([getCurrentUser(), listSessions(), hasPassword()]),
    ROUTE_SETTINGS,
  )

  return (
    <div className={styles.page}>
      <PageHeader title="Settings" description="Manage your account." />
      <SettingsView user={user} sessions={sessions} hasPassword={userHasPassword} />
    </div>
  )
}

export default SettingsPage
