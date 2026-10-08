import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/SCN/button'
import { ROUTE_ADMIN, ROUTE_ADMIN_AUDIT } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { getCurrentUser, listUsers } from '@/lib/data/users'
import { usersUrlQuery } from '@/lib/dto/users'
import { toScalarParams } from '@/lib/searchParams'
import { AdminView } from './view'
import styles from './styles.module.scss'

const PER_PAGE = 10

export const metadata: Metadata = {
  title: 'Admin',
}

const AdminPage = async ({ searchParams }: PageProps<'/admin'>) => {
  // A garbled URL falls back to the defaults, like the post lists.
  const query = usersUrlQuery.parse(toScalarParams(await searchParams))
  const { users, viewer } = await loadPage(async () => {
    // `listUsers` demands an admin first: a regular user gets the not-found page.
    const users = await listUsers({ ...query, perPage: PER_PAGE })
    return { users, viewer: await getCurrentUser() }
  }, ROUTE_ADMIN)

  return (
    <div className={styles.page}>
      <PageHeader
        title="Admin"
        description="Users and their roles."
        actions={
          <Button asChild variant="outline">
            <Link href={ROUTE_ADMIN_AUDIT}>Audit log</Link>
          </Button>
        }
      />
      <AdminView users={users} viewerId={viewer.id} />
    </div>
  )
}

export default AdminPage
