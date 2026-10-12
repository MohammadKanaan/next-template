'use client'

import { Layers } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignOutButton } from '@/components/Auth/SignOutButton'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { UserAvatar } from '@/components/UserAvatar'
import { ROUTE_ADMIN, ROUTE_SETTINGS } from '@/lib/constants-routes'
import type { CurrentUser } from '@/lib/dto/users'
import { env } from '@/lib/env'
import { ADMIN_NAV, activeAdminHref } from '../nav'
import styles from './styles.module.scss'

type AdminSidebarProps = {
  viewer: CurrentUser
}

/** The dashboard's navigation: one group per area, the signed-in admin at the bottom. */
export const AdminSidebar = ({ viewer }: AdminSidebarProps) => {
  const pathname = usePathname()
  const activeHref = activeAdminHref(pathname)

  return (
    <Sidebar collapsible="icon" role="navigation" aria-label="Admin">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href={ROUTE_ADMIN} />}>
              <span className={styles.brandMark} aria-hidden="true">
                <Layers />
              </span>
              <span className={styles.brandText}>
                <span className={styles.brandName}>{env.appName}</span>
                <span className={styles.brandArea}>Admin</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {ADMIN_NAV.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = item.href === activeHref
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.label}
                        render={
                          <Link href={item.href} aria-current={isActive ? 'page' : undefined} />
                        }
                      >
                        <item.icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <div className={styles.account}>
          <Link href={ROUTE_SETTINGS} className={styles.accountLink} aria-label="Account settings">
            <UserAvatar name={viewer.name} image={viewer.image} size="sm" />
            <span className={styles.accountText}>
              <span className={styles.accountName}>{viewer.name}</span>
              <span className={styles.accountEmail}>{viewer.email}</span>
            </span>
          </Link>
          <div className={styles.signOut}>
            <SignOutButton />
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
