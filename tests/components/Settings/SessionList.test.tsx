import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SessionList } from '@/components/Settings/SessionList'
import type { SessionSummary } from '@/lib/dto/users'

const sessions: SessionSummary[] = [
  {
    id: 's-current',
    current: true,
    userAgent: 'Firefox on Linux',
    createdAt: new Date('2026-10-05T15:04:00.000Z'),
    expiresAt: new Date('2026-10-12T15:04:00.000Z'),
  },
  {
    id: 's-phone',
    current: false,
    userAgent: null,
    createdAt: new Date('2026-10-04T08:00:00.000Z'),
    expiresAt: new Date('2026-10-11T08:00:00.000Z'),
  },
]

const ok = { ok: true, data: null } as const

describe('SessionList', () => {
  it('lists every session, marks this device and can only revoke the others', () => {
    render(<SessionList sessions={sessions} onRevoke={vi.fn()} onRevokeOthers={vi.fn()} />)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)

    expect(within(rows[0]).getByText('Firefox on Linux')).toBeInTheDocument()
    expect(within(rows[0]).getByText('This device')).toBeInTheDocument()
    expect(within(rows[0]).queryByRole('button')).not.toBeInTheDocument()

    expect(within(rows[1]).getByText('Unknown device')).toBeInTheDocument()
    expect(within(rows[1]).getByRole('button', { name: 'Revoke' })).toBeInTheDocument()
  })

  it('revokes one session by id', async () => {
    const onRevoke = vi.fn().mockResolvedValue(ok)
    render(<SessionList sessions={sessions} onRevoke={onRevoke} onRevokeOthers={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    expect(onRevoke).toHaveBeenCalledWith('s-phone')
  })

  it('signs the other devices out in one go', async () => {
    const onRevokeOthers = vi.fn().mockResolvedValue(ok)
    render(<SessionList sessions={sessions} onRevoke={vi.fn()} onRevokeOthers={onRevokeOthers} />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign out other devices' }))
    expect(onRevokeOthers).toHaveBeenCalledTimes(1)
  })

  it('hides the bulk button when this is the only session', () => {
    render(<SessionList sessions={[sessions[0]]} onRevoke={vi.fn()} onRevokeOthers={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Sign out other devices' })).not.toBeInTheDocument()
  })

  it('disables the buttons while a request runs', async () => {
    let finish: (value: typeof ok) => void = () => {}
    const onRevoke = vi.fn(() => new Promise<typeof ok>((resolve) => (finish = resolve)))
    render(<SessionList sessions={sessions} onRevoke={onRevoke} onRevokeOthers={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sign out other devices' })).toBeDisabled()
    finish(ok)
    expect(await screen.findByRole('button', { name: 'Sign out other devices' })).toBeEnabled()
  })

  it('shows a failure message', async () => {
    const onRevoke = vi
      .fn()
      .mockResolvedValue({ ok: false, code: 'NOT_FOUND', message: 'Session not found' })
    render(<SessionList sessions={sessions} onRevoke={onRevoke} onRevokeOthers={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Session not found')
  })
})
