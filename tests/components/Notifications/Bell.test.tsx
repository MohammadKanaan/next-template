import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { markAllNotificationsReadAction, markNotificationReadAction } from '@/actions/notifications'
import { NotificationBell } from '@/components/Notifications/Bell'
import { useRealtime } from '@/hooks/useRealtime'
import { fetchNotifications } from '@/lib/client/notifications'
import type { Notification, RealtimeEvent } from '@/lib/dto/notifications'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock('@/actions/notifications', () => ({
  markNotificationReadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}))
vi.mock('@/lib/client/notifications', () => ({ fetchNotifications: vi.fn() }))
vi.mock('@/hooks/useRealtime', () => ({ useRealtime: vi.fn() }))

const notification = (id: number, readAt: Date | null = null): Notification => ({
  id,
  type: 'comment',
  title: `Comment ${id}`,
  body: 'Body',
  url: `/posts/u1/${id}`,
  readAt,
  createdAt: new Date('2026-10-07T10:00:00.000Z'),
})

const page = (items: Notification[]) => ({
  items,
  page: 1,
  perPage: 10,
  totalItems: items.length,
  totalPages: 1,
})

/** The handler the bell gave to `useRealtime` on its last render. */
const emit = (event: RealtimeEvent) => {
  const calls = vi.mocked(useRealtime).mock.calls
  act(() => calls[calls.length - 1][0](event))
}

/** jsdom cannot navigate; swallow the default action of a link click. */
const blockNavigation = (event: Event) => event.preventDefault()

describe('NotificationBell', () => {
  beforeEach(() => {
    document.addEventListener('click', blockNavigation)
    vi.mocked(fetchNotifications).mockResolvedValue(
      page([notification(1), notification(2, new Date())]),
    )
    vi.mocked(markNotificationReadAction).mockResolvedValue({
      ok: true,
      data: notification(1, new Date()),
    })
    vi.mocked(markAllNotificationsReadAction).mockResolvedValue({ ok: true, data: 1 })
  })
  afterEach(() => {
    document.removeEventListener('click', blockNavigation)
    vi.clearAllMocks()
  })

  it('shows the unread count and loads the latest notifications when opened', async () => {
    render(<NotificationBell initialUnreadCount={3} />)
    const button = screen.getByRole('button', { name: 'Notifications, 3 unread' })
    expect(button).toHaveTextContent('3')
    await userEvent.click(button)
    await waitFor(() => expect(screen.getByRole('link', { name: /Comment 1/ })).toBeInTheDocument())
    expect(fetchNotifications).toHaveBeenCalledWith({ page: 1, perPage: 10 })
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/notifications')
  })

  it('hides the badge at zero', () => {
    render(<NotificationBell initialUnreadCount={0} />)
    expect(screen.getByRole('button', { name: 'Notifications' })).not.toHaveTextContent('0')
  })

  it('reacts to realtime events: unread resets the count, a notification bumps it and toasts', () => {
    render(<NotificationBell initialUnreadCount={1} />)
    emit({ type: 'unread', count: 5 })
    expect(screen.getByRole('button', { name: 'Notifications, 5 unread' })).toBeInTheDocument()
    emit({ type: 'notification', notification: notification(9) })
    expect(screen.getByRole('button', { name: 'Notifications, 6 unread' })).toBeInTheDocument()
    expect(toast).toHaveBeenCalledWith(
      'Comment 9',
      expect.objectContaining({ description: 'Body' }),
    )
  })

  it('marks an item read when opened and decrements the badge', async () => {
    render(<NotificationBell initialUnreadCount={2} />)
    await userEvent.click(screen.getByRole('button', { name: 'Notifications, 2 unread' }))
    const link = await screen.findByRole('link', { name: /Comment 1/ })
    await userEvent.click(link)
    expect(markNotificationReadAction).toHaveBeenCalledWith(1)
    expect(screen.getByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument()
  })

  it('marks everything read from the popover', async () => {
    render(<NotificationBell initialUnreadCount={2} />)
    await userEvent.click(screen.getByRole('button', { name: 'Notifications, 2 unread' }))
    await screen.findByRole('link', { name: /Comment 1/ })
    await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument(),
    )
    expect(markAllNotificationsReadAction).toHaveBeenCalled()
  })
})
