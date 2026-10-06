'use client'

import clsx from 'clsx'
import { Menu, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useEffectEvent, useState } from 'react'
import { SignOutButton } from '@/components/Auth/SignOutButton'
import { Button } from '@/components/SCN/button'
import { ThemeToggle } from '@/components/ThemeToggle'
import { UserAvatar } from '@/components/UserAvatar'
import { useScrollLock } from '@/hooks/useScrollLock'
import { BREAKPOINTS } from '@/lib/constants-breakpoints'
import {
  ROUTE_ADMIN,
  ROUTE_HOME,
  ROUTE_LOGIN,
  ROUTE_POSTS,
  ROUTE_PRIVATE,
  ROUTE_SETTINGS,
  ROUTE_UI_KIT,
} from '@/lib/constants-routes'
import type { CurrentUser } from '@/lib/dto/users'
import { env } from '@/lib/env'
import styles from './styles.module.scss'

const MOBILE_NAV_ID = 'mobile-nav'

const NAV_LINKS = [
  { label: 'Posts', href: ROUTE_POSTS },
  { label: 'UI Kit', href: ROUTE_UI_KIT },
  { label: 'Private', href: ROUTE_PRIVATE },
]

/** Only for admins; the page itself is guarded by the DAL, this just hides the link. */
const ADMIN_LINK = { label: 'Admin', href: ROUTE_ADMIN }

type NavLink = (typeof NAV_LINKS)[number]

type NavLinksProps = {
  links: NavLink[]
}

const NavLinks = ({ links }: NavLinksProps) => {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return links.map((link) => (
    <Link
      key={link.href}
      href={link.href}
      className={clsx(styles.navLink, isActive(link.href) && styles.navLinkActive)}
    >
      <span>{link.label}</span>
    </Link>
  ))
}

type AccountActionsProps = {
  user: CurrentUser | null
}

const AccountActions = ({ user }: AccountActionsProps) => {
  if (!user) {
    return (
      <Button asChild size="sm">
        <Link href={ROUTE_LOGIN}>Log in</Link>
      </Button>
    )
  }
  return (
    <>
      <Link href={ROUTE_SETTINGS} className={styles.profileLink} aria-label="Account settings">
        <UserAvatar name={user.name} image={user.image} size="sm" />
        <span className={styles.userName}>{user.name}</span>
      </Link>
      <SignOutButton />
    </>
  )
}

type NavBarProps = {
  user: CurrentUser | null
}

export const NavBar = ({ user }: NavBarProps) => {
  const { lockScroll, unlockScroll } = useScrollLock()
  const links = user?.role === 'admin' ? [...NAV_LINKS, ADMIN_LINK] : NAV_LINKS
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false)
    unlockScroll()
  }

  const toggleMobileMenu = () => {
    if (isMobileMenuOpen) {
      closeMobileMenu()
      return
    }

    setIsMobileMenuOpen(true)
    lockScroll()
  }

  const closeOnDesktop = useEffectEvent(() => {
    if (window.matchMedia(`(min-width: ${BREAKPOINTS.md})`).matches) {
      closeMobileMenu()
    }
  })

  useEffect(() => {
    const handleResize = () => closeOnDesktop()

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <header className={styles.header}>
      <nav className={styles.nav}>
        <Link href={ROUTE_HOME} className={styles.brand}>
          {env.appName}
        </Link>

        <button
          type="button"
          className={styles.mobileMenuButton}
          aria-label="Toggle navigation menu"
          aria-expanded={isMobileMenuOpen}
          aria-controls={MOBILE_NAV_ID}
          onClick={toggleMobileMenu}
        >
          {isMobileMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>

        <div className={styles.desktopNav}>
          <NavLinks links={links} />
          <div className={styles.accountArea}>
            <ThemeToggle />
            <AccountActions user={user} />
          </div>
        </div>

        <div
          className={clsx(styles.mobileNavOverlay, isMobileMenuOpen && styles.active)}
          aria-hidden="true"
          onClick={closeMobileMenu}
        />

        <div
          id={MOBILE_NAV_ID}
          className={clsx(styles.mobileNav, isMobileMenuOpen && styles.active)}
          inert={!isMobileMenuOpen}
        >
          <div className={styles.mobileNavHeader}>{env.appName}</div>
          <div className={styles.mobileNavLinks}>
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={styles.mobileNavLink}
                onClick={closeMobileMenu}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className={styles.mobileAccountArea}>
            <ThemeToggle />
            {/* Account actions close the menu; theme choices keep it open. */}
            <div className={styles.accountArea} onClick={closeMobileMenu}>
              <AccountActions user={user} />
            </div>
          </div>
        </div>
      </nav>
    </header>
  )
}
