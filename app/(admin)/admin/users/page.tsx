import type { Metadata } from 'next'
import { UsersView } from '@/components/Admin/Users/UsersView'
import { PageHeader } from '@/components/PageHeader'
import { ROUTE_ADMIN_USERS } from '@/lib/constants-routes'
import { listUsers } from '@/lib/data/admin'
import { loadPage } from '@/lib/data/page'
import { getCurrentUser } from '@/lib/data/users'
import { usersUrlQuery } from '@/lib/dto/users'
import { toScalarParams } from '@/lib/searchParams'
import styles from './styles.module.scss'

const PER_PAGE = 20

export const metadata: Metadata = {
  title: 'Users · Admin',
}

const AdminUsersPage = async ({ searchParams }: PageProps<'/admin/users'>) => {
  // A garbled URL falls back to the defaults; empty filters are left out of the query.
  const { q, role, status, page, sortBy, direction } = usersUrlQuery.parse(
    toScalarParams(await searchParams),
  )
  const { users, viewer } = await loadPage(async () => {
    // `listUsers` demands an admin first: a regular user gets the not-found page.
    const users = await listUsers({
      page,
      sortBy,
      direction,
      perPage: PER_PAGE,
      q: q || undefined,
      role: role || undefined,
      status: status || undefined,
    })
    return { users, viewer: await getCurrentUser() }
  }, ROUTE_ADMIN_USERS)

  return (
    <div className={styles.page}>
      <PageHeader
        title="Users"
        description={`${users.totalItems} ${users.totalItems === 1 ? 'account' : 'accounts'}. Roles, bans and impersonation.`}
      />
      <UsersView users={users} viewerId={viewer.id} />
    </div>
  )
}

export default AdminUsersPage
