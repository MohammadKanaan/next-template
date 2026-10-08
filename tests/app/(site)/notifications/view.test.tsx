import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotificationsView } from '@/app/(site)/notifications/view'
import { markAllNotificationsReadAction } from '@/actions/notifications'
import { fetchNotifications } from '@/lib/client/notifications'
import type { CursorPage } from '@/lib/dto/common'
import type { Notification } from '@/lib/dto/notifications'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/client/notifications', () => ({ fetchNotifications: vi.fn() }))
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

const page = (
  items: Notification[],
  nextCursor: string | null = null,
): CursorPage<Notification> => {
  return { items, nextCursor }
}

describe('NotificationsView', () => {
  afterEach(() => vi.clearAllMocks())

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

  it('offers no "Load more" on the last page', () => {
    render(<NotificationsView notifications={page([notification(1)])} />)
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('appends the next page with the cursor and drops the button on the last one', async () => {
    vi.mocked(fetchNotifications).mockResolvedValue(page([notification(1, new Date())]))
    render(<NotificationsView notifications={page([notification(2), notification(3)], 'c3')} />)
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByRole('link', { name: /Comment 1/ })).toBeInTheDocument()
    expect(fetchNotifications).toHaveBeenCalledWith({ cursor: 'c3' }, expect.any(AbortSignal))
    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('shows a failed load and lets the reader try again', async () => {
    vi.mocked(fetchNotifications)
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(page([notification(1, new Date())]))
    render(<NotificationsView notifications={page([notification(2, new Date())], 'c2')} />)
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down')
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByRole('link', { name: /Comment 1/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('marks the loaded pages read too after "Mark all read"', async () => {
    vi.mocked(markAllNotificationsReadAction).mockResolvedValue({ ok: true, data: 2 })
    vi.mocked(fetchNotifications).mockResolvedValue(page([notification(1)]))
    render(<NotificationsView notifications={page([notification(2)], 'c2')} />)
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByRole('link', { name: /Comment 1/ })
    expect(screen.getAllByText('Unread')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    await waitFor(() => expect(screen.queryByText('Unread')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Mark all read' })).not.toBeInTheDocument()
  })
})
