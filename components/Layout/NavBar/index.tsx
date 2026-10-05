'use client'

import clsx from 'clsx'
import { Menu, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { SignOutButton } from '@/components/Auth/SignOutButton'
import { Button } from '@/components/SCN/button'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useScrollLock } from '@/hooks/useScrollLock'
import { BREAKPOINTS } from '@/lib/constants-breakpoints'
import {
  ROUTE_HOME,
  ROUTE_LOGIN,
  ROUTE_POSTS,
  ROUTE_PRIVATE,
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

type NavLinksProps = {
  pathname: string | null
}

function NavLinks({ pathname }: NavLinksProps) {
  const isActive = (href: string) =>
    pathname !== null && (pathname === href || pathname.startsWith(`${href}/`))

  return NAV_LINKS.map((link) => (
    <Link
      key={link.href}
      href={link.href}
      className={clsx(styles.navLink, isActive(link.href) && styles.navLinkActive)}
    >
      <span>{link.label}</span>
    </Link>
  ))
}

/** Reads the pathname, which is not known while prerendering a route with dynamic params. */
function ActiveNavLinks() {
  return <NavLinks pathname={usePathname()} />
}

type AccountActionsProps = {
  user: CurrentUser | null
  pending: boolean
}

function AccountActions({ user, pending }: AccountActionsProps) {
  if (pending) {
    return null
  }
  if (!user) {
    return (
      <Button asChild size="sm">
        <Link href={ROUTE_LOGIN}>Log in</Link>
      </Button>
    )
  }
  return (
    <>
      <span className={styles.userName}>{user.name}</span>
      <SignOutButton />
    </>
  )
}

type NavBarProps = {
  user: CurrentUser | null
  /** The viewer is still loading: show no account actions rather than a wrong "Log in". */
  pending?: boolean
}

export function NavBar({ user, pending = false }: NavBarProps) {
  const { lockScroll, unlockScroll } = useScrollLock()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false)
    unlockScroll()
  }, [unlockScroll])

  const toggleMobileMenu = () => {
    if (isMobileMenuOpen) {
      closeMobileMenu()
      return
    }

    setIsMobileMenuOpen(true)
    lockScroll()
  }

  useEffect(() => {
    const handleResize = () => {
      if (window.matchMedia(`(min-width: ${BREAKPOINTS.md})`).matches) {
        closeMobileMenu()
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [closeMobileMenu])

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
          <Suspense fallback={<NavLinks pathname={null} />}>
            <ActiveNavLinks />
          </Suspense>
          <div className={styles.accountArea}>
            <ThemeToggle />
            <AccountActions user={user} pending={pending} />
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
            {NAV_LINKS.map((link) => (
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
              <AccountActions user={user} pending={pending} />
            </div>
          </div>
        </div>
      </nav>
    </header>
  )
}
