import type { Metadata } from 'next'
import Link from 'next/link'
import { StatCard } from '@/components/Admin/StatCard'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/UserAvatar'
import {
  adminUserPath,
  ROUTE_ADMIN,
  ROUTE_ADMIN_USERS,
  ROUTE_POST_DETAILS,
  ROUTE_POSTS,
} from '@/lib/constants-routes'
import { getAdminOverview } from '@/lib/data/admin'
import { loadPage } from '@/lib/data/page'
import { formatDate } from '@/lib/formatDate'
import styles from './styles.module.scss'

export const metadata: Metadata = {
  title: 'Admin',
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

const AdminOverviewPage = async () => {
  const { counts, recentPosts, recentUsers } = await loadPage(getAdminOverview, ROUTE_ADMIN)

  return (
    <div className={styles.page}>
      <PageHeader title="Overview" description="The site and its users at a glance." />

      <section className={styles.stats} aria-label="Counts">
        <StatCard
          label="Users"
          value={counts.users}
          href={ROUTE_ADMIN_USERS}
          hint={`${counts.admins} ${plural(counts.admins, 'admin', 'admins')} · ${counts.banned} banned`}
        />
        <StatCard
          label="Posts"
          value={counts.posts}
          href={ROUTE_POSTS}
          hint={`${counts.drafts} ${plural(counts.drafts, 'draft', 'drafts')}`}
        />
      </section>

      <div className={styles.columns}>
        <section className={styles.panel} aria-labelledby="recent-posts">
          <header className={styles.panelHeader}>
            <h2 id="recent-posts" className={styles.panelTitle}>
              Recent posts
            </h2>
            <Link href={ROUTE_POSTS} className={styles.panelLink}>
              All posts
            </Link>
          </header>
          {recentPosts.length === 0 ? (
            <p className={styles.empty}>No posts yet.</p>
          ) : (
            <ul className={styles.list}>
              {recentPosts.map((post) => (
                <li key={post.id}>
                  <Link href={ROUTE_POST_DETAILS(post.id)} className={styles.row}>
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>{post.title}</span>
                      <span className={styles.rowMeta}>
                        {post.author.name} · {formatDate(post.createdAt)}
                      </span>
                    </span>
                    {!post.published && <Badge variant="outline">Draft</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="recent-users">
          <header className={styles.panelHeader}>
            <h2 id="recent-users" className={styles.panelTitle}>
              Newest users
            </h2>
            <Link href={ROUTE_ADMIN_USERS} className={styles.panelLink}>
              All users
            </Link>
          </header>
          <ul className={styles.list}>
            {recentUsers.map((user) => (
              <li key={user.id}>
                <Link href={adminUserPath(user.id)} className={styles.row}>
                  <UserAvatar name={user.name} image={null} size="sm" />
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>{user.name}</span>
                    <span className={styles.rowMeta}>
                      @{user.username} · joined {formatDate(user.createdAt)}
                    </span>
                  </span>
                  {user.banned ? (
                    <Badge variant="destructive">Banned</Badge>
                  ) : (
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                      {user.role}
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

export default AdminOverviewPage
