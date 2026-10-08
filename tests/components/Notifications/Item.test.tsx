import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationItem } from '@/components/Notifications/Item'
import type { Notification } from '@/lib/dto/notifications'

const notification: Notification = {
  id: 1,
  type: 'comment',
  title: 'Casey commented on "Post"',
  body: 'Nice',
  url: '/posts/u1/1',
  readAt: null,
  createdAt: new Date('2026-10-07T10:00:00.000Z'),
}

/** jsdom cannot navigate; swallow the default action of a link click. */
const blockNavigation = (event: Event) => event.preventDefault()

describe('NotificationItem', () => {
  beforeEach(() => document.addEventListener('click', blockNavigation))
  afterEach(() => document.removeEventListener('click', blockNavigation))

  it('links to the notification url and reports a click', async () => {
    const onOpen = vi.fn()
    render(<NotificationItem notification={notification} onOpen={onOpen} />)
    const link = screen.getByRole('link', { name: /Casey commented/ })
    expect(link).toHaveAttribute('href', '/posts/u1/1')
    await userEvent.click(link)
    expect(onOpen).toHaveBeenCalledWith(notification)
  })

  it('marks unread items for assistive tech', () => {
    const { rerender } = render(<NotificationItem notification={notification} onOpen={() => {}} />)
    expect(screen.getByText('Unread')).toBeInTheDocument()
    rerender(
      <NotificationItem notification={{ ...notification, readAt: new Date() }} onOpen={() => {}} />,
    )
    expect(screen.queryByText('Unread')).not.toBeInTheDocument()
  })
})
