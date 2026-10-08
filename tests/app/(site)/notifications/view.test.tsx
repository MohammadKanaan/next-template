import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NotificationsView } from '@/app/(site)/notifications/view'
import type { Page } from '@/lib/dto/common'
import type { Notification } from '@/lib/dto/notifications'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/notifications',
  useSearchParams: () => new URLSearchParams(''),
}))
vi.mock('@/actions/notifications', () => ({
  markNotificationReadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}))

const notification = (id: number, readAt: Date | null = null): Notification => ({
  id,
  type: 'comment',
  title: `Comment ${id}`,
  body: 'Body',
  url: `/posts/u1/${id}`,
  readAt,
  createdAt: new Date('2026-10-07T10:00:00.000Z'),
})

const page = (items: Notification[]): Page<Notification> => {
  return { items, page: 1, perPage: 20, totalItems: items.length, totalPages: 1 }
}

describe('NotificationsView', () => {
  it('lists the notifications and offers "Mark all read" while any is unread', () => {
    render(
      <NotificationsView notifications={page([notification(1), notification(2, new Date())])} />,
    )
    expect(screen.getByRole('link', { name: /Comment 1/ })).toHaveAttribute('href', '/posts/u1/1')
    expect(screen.getByRole('link', { name: /Comment 2/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeInTheDocument()
  })

  it('hides "Mark all read" when everything is read', () => {
    render(<NotificationsView notifications={page([notification(1, new Date())])} />)
    expect(screen.queryByRole('button', { name: 'Mark all read' })).not.toBeInTheDocument()
  })

  it('shows an empty state without notifications', () => {
    render(<NotificationsView notifications={page([])} />)
    expect(screen.getByRole('heading', { name: 'No notifications' })).toBeInTheDocument()
  })
})
