import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { PageLoading } from '@/components/PageLoading'
import { ROUTE_SETTINGS } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { listSessions } from '@/lib/data/sessions'
import { getCurrentUser } from '@/lib/data/users'
import { SettingsView } from './view'
import styles from './styles.module.scss'

export const metadata: Metadata = {
  title: 'Settings',
}

async function Settings() {
  const { user, sessions } = await loadPage(async () => {
    const [user, sessions] = await Promise.all([getCurrentUser(), listSessions()])
    return { user, sessions }
  }, ROUTE_SETTINGS)
  return <SettingsView user={user} sessions={sessions} />
}

export default function SettingsPage() {
  return (
    <div className={styles.page}>
      <PageHeader title="Settings" description="Manage your account." />
      <Suspense fallback={<PageLoading />}>
        <Settings />
      </Suspense>
    </div>
  )
}
