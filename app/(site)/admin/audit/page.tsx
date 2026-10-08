import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { ROUTE_ADMIN_AUDIT } from '@/lib/constants-routes'
import { listAuditLog } from '@/lib/data/audit'
import { loadPage } from '@/lib/data/page'
import { auditUrlQuery } from '@/lib/dto/audit'
import { toScalarParams } from '@/lib/searchParams'
import { AuditView } from './view'
import styles from './styles.module.scss'

const PER_PAGE = 20

export const metadata: Metadata = {
  title: 'Audit log',
}

const AuditPage = async ({ searchParams }: PageProps<'/admin/audit'>) => {
  // A garbled URL falls back to the defaults, like the post lists.
  const query = auditUrlQuery.parse(toScalarParams(await searchParams))
  // `listAuditLog` demands an admin first: a regular user gets the not-found page.
  const entries = await loadPage(
    () =>
      listAuditLog({
        page: query.page,
        perPage: PER_PAGE,
        entityType: query.entityType || undefined,
        actorId: query.actorId || undefined,
      }),
    ROUTE_ADMIN_AUDIT,
  )

  return (
    <div className={styles.page}>
      <PageHeader title="Audit log" description="Who changed what, newest first." />
      <AuditView entries={entries} />
    </div>
  )
}

export default AuditPage
