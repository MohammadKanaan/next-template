import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { PageLoading } from '@/components/PageLoading'
import { ROUTE_ADMIN } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { getCurrentUser, listUsers } from '@/lib/data/users'
import { usersUrlQuery } from '@/lib/dto/users'
import { AdminView } from './view'
import styles from './styles.module.scss'

const PER_PAGE = 10

export const metadata: Metadata = {
  title: 'Admin',
}

type AdminUsersProps = Pick<PageProps<'/admin'>, 'searchParams'>

async function AdminUsers({ searchParams }: AdminUsersProps) {
  // A garbled URL falls back to the defaults, like the post lists.
  const query = usersUrlQuery.parse(await searchParams)
  const { users, viewer } = await loadPage(async () => {
    // `listUsers` demands an admin first: a regular user gets the not-found page.
    const users = await listUsers({ ...query, perPage: PER_PAGE })
    return { users, viewer: await getCurrentUser() }
  }, ROUTE_ADMIN)
  return <AdminView users={users} viewerId={viewer.id} />
}

export default function AdminPage({ searchParams }: PageProps<'/admin'>) {
  return (
    <div className={styles.page}>
      <PageHeader title="Admin" description="Users and their roles." />
      <Suspense fallback={<PageLoading />}>
        <AdminUsers searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
