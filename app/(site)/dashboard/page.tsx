import type { Metadata } from 'next'
import { SignOutButton } from '@/components/Auth/SignOutButton'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/SCN/card'
import { PostsPerDayChart } from '@/components/Stats/PostsPerDayChart'
import { StatCard } from '@/components/Stats/StatCard'
import { ROUTE_DASHBOARD } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { getMyStats, getPostsPerDay, getSiteStats } from '@/lib/data/stats'
import { POSTS_PER_DAY_DEFAULT } from '@/lib/dto/stats'
import styles from './styles.module.scss'

export const metadata: Metadata = {
  title: 'Dashboard',
}

const DashboardPage = async () => {
  // One read per stat, in parallel; a signed-out viewer is sent to login by `getMyStats`.
  const [mine, site, perDay] = await loadPage(
    () => Promise.all([getMyStats(), getSiteStats(), getPostsPerDay()]),
    ROUTE_DASHBOARD,
  )

  return (
    <div className={styles.page}>
      <PageHeader
        title="Dashboard"
        description="Your posts and what is happening across the site."
        actions={<SignOutButton />}
      />

      <section className={styles.section} aria-labelledby="my-stats-title">
        <h2 id="my-stats-title" className={styles.sectionTitle}>
          Your posts
        </h2>
        <div className={styles.cards}>
          <StatCard label="Drafts" value={mine.posts.draft} />
          <StatCard label="Published" value={mine.posts.published} />
          <StatCard label="Archived" value={mine.posts.archived} />
          <StatCard
            label="Comments received"
            value={mine.commentsReceived}
            hint="From other people, on all your posts"
          />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="site-stats-title">
        <h2 id="site-stats-title" className={styles.sectionTitle}>
          Across the site
        </h2>
        <div className={styles.cards}>
          <StatCard label="Published posts" value={site.publishedPosts} />
          <StatCard label="Comments" value={site.comments} hint="On published posts" />
          <StatCard label="Tags" value={site.tags} hint="In use by published posts" />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Posts published per day</CardTitle>
          <CardDescription>The last {POSTS_PER_DAY_DEFAULT} days, in UTC.</CardDescription>
        </CardHeader>
        <CardContent>
          <PostsPerDayChart data={perDay} />
        </CardContent>
      </Card>
    </div>
  )
}

export default DashboardPage
