import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuditView } from '@/app/(site)/admin/audit/view'
import type { AuditEntry } from '@/lib/dto/audit'
import type { Page } from '@/lib/dto/common'

const navigation = vi.hoisted(() => ({ search: '', replace: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
  usePathname: () => '/admin/audit',
  useSearchParams: () => new URLSearchParams(navigation.search),
}))

// Radix Select measures and captures pointers, which jsdom does not implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

const entry = (overrides: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 1,
  action: 'post.status',
  entityType: 'post',
  entityId: '12',
  metadata: { from: 'draft', to: 'published' },
  actor: { id: 'u-ada', name: 'Ada Lovelace', username: 'ada' },
  createdAt: new Date('2026-10-08T15:04:00.000Z'),
  ...overrides,
})

const page = (items: AuditEntry[], overrides: Partial<Page<AuditEntry>> = {}): Page<AuditEntry> => {
  return { items, page: 1, perPage: 20, totalItems: items.length, totalPages: 1, ...overrides }
}

describe('AuditView', () => {
  beforeEach(() => {
    navigation.search = ''
    navigation.replace.mockReset()
  })

  it('renders each entry with its actor, action, entity and details', () => {
    render(<AuditView entries={page([entry()])} />)
    const row = screen.getByRole('row', { name: /Ada Lovelace/ })
    expect(within(row).getByText('@ada')).toBeInTheDocument()
    expect(within(row).getByText('Changed a post status')).toBeInTheDocument()
    expect(within(row).getByText('12')).toBeInTheDocument()
    expect(within(row).getByText('from: draft · to: published')).toBeInTheDocument()
  })

  it('shows "Deleted user" when the actor is gone and joins list metadata', () => {
    render(
      <AuditView
        entries={page([
          entry({
            actor: null,
            action: 'post.update',
            metadata: { fields: ['title', 'tags'], version: 3 },
          }),
        ])}
      />,
    )
    expect(screen.getByText('Deleted user')).toBeInTheDocument()
    expect(screen.getByText('fields: title, tags · version: 3')).toBeInTheDocument()
  })

  it('shows an empty state without entries', () => {
    render(<AuditView entries={page([])} />)
    expect(screen.getByRole('heading', { name: 'No entries' })).toBeInTheDocument()
  })

  it('filters by entity type and returns to the first page', async () => {
    navigation.search = 'page=3'
    render(<AuditView entries={page([entry()], { page: 3, totalPages: 4 })} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Entity' }))
    await userEvent.click(screen.getByRole('option', { name: 'Comments' }))
    expect(navigation.replace).toHaveBeenCalledTimes(1)
    const url = new URL(navigation.replace.mock.calls[0][0], 'http://localhost')
    expect(url.searchParams.get('entityType')).toBe('comment')
    expect(url.searchParams.has('page')).toBe(false)
  })

  it('pages through the URL', async () => {
    render(<AuditView entries={page([entry()], { totalPages: 3 })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    const url = new URL(navigation.replace.mock.calls[0][0], 'http://localhost')
    expect(url.searchParams.get('page')).toBe('2')
  })
})
