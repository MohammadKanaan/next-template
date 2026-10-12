import { LayoutDashboard, ShieldCheck, type LucideIcon } from 'lucide-react'
import { ROUTE_ADMIN, ROUTE_ADMIN_USERS } from '@/lib/constants-routes'

export type AdminNavItem = {
  label: string
  href: string
  icon: LucideIcon
}

export type AdminNavGroup = {
  label: string
  items: AdminNavItem[]
}

/** The dashboard's sections, in sidebar order. A new section is an item here and a route. */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'Dashboard',
    items: [{ label: 'Overview', href: ROUTE_ADMIN, icon: LayoutDashboard }],
  },
  {
    label: 'Access',
    items: [{ label: 'Users', href: ROUTE_ADMIN_USERS, icon: ShieldCheck }],
  },
]

/**
 * The section a path belongs to: the item whose href is the longest prefix of it, so
 * `/admin/users/<id>` lights up Users, not Overview.
 */
export const activeAdminHref = (pathname: string): string | null =>
  ADMIN_NAV.flatMap((group) => group.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .reduce<string | null>(
      (best, item) => (best === null || item.href.length > best.length ? item.href : best),
      null,
    )
