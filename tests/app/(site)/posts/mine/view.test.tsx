import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MyPostsView } from '@/app/(site)/posts/mine/view'
import type { Page } from '@/lib/dto/common'
import type { PostSummary } from '@/lib/dto/posts'

const search = vi.hoisted(() => ({ value: '' }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/posts/mine',
  useSearchParams: () => new URLSearchParams(search.value),
}))

const author = {
  id: '0190d1a2-0000-7000-8000-0000000000a1',
  name: 'Ada',
  username: 'ada',
  website: null,
}
const draft: PostSummary = {
  id: '0190d1a2-0000-7000-8000-000000000001',
  title: 'A draft',
  excerpt: 'e',
  published: false,
  createdAt: new Date('2026-10-05T15:04:00.000Z'),
  author,
}
const published: PostSummary = {
  ...draft,
  id: '0190d1a2-0000-7000-8000-000000000002',
  title: 'Live post',
  published: true,
}

const page = (items: PostSummary[]): Page<PostSummary> => {
  return { items, page: 1, perPage: 10, totalItems: items.length, totalPages: 1 }
}

describe('MyPostsView', () => {
  afterEach(() => {
    search.value = ''
  })

  it('shows each post with its status and links to view and edit it', () => {
    render(<MyPostsView posts={page([draft, published])} />)
    const draftRow = screen.getByRole('row', { name: /A draft/ })
    expect(within(draftRow).getByText('Draft')).toBeInTheDocument()
    expect(within(draftRow).getByRole('link', { name: /^View/ })).toHaveAttribute(
      'href',
      `/posts/${draft.id}`,
    )
    expect(within(draftRow).getByRole('link', { name: /^Edit/ })).toHaveAttribute(
      'href',
      `/posts/${draft.id}/edit`,
    )

    const liveRow = screen.getByRole('row', { name: /Live post/ })
    expect(within(liveRow).getByText('Published')).toBeInTheDocument()
    expect(within(liveRow).getByRole('link', { name: /^View/ })).toHaveAttribute(
      'href',
      `/posts/${published.id}`,
    )
    expect(within(liveRow).getByRole('link', { name: /^Edit/ })).toHaveAttribute(
      'href',
      `/posts/${published.id}/edit`,
    )
  })

  it('shows the search and sort filters above the posts', () => {
    search.value = 'q=cats&sort=oldest'
    render(<MyPostsView posts={page([draft])} />)
    expect(screen.getByLabelText('Search')).toHaveValue('cats')
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Oldest first')
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument()
  })

  it('invites the author to write a first post when there are none', () => {
    render(<MyPostsView posts={page([])} />)
    expect(screen.getByText('No posts yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Write a post' })).toHaveAttribute('href', '/posts/new')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('says nothing matches, keeping the filters, when a search finds no posts', () => {
    search.value = 'q=cats'
    render(<MyPostsView posts={page([])} />)
    expect(screen.queryByText('No posts yet')).not.toBeInTheDocument()
    expect(screen.getByText('No matching posts')).toBeInTheDocument()
    expect(screen.getByLabelText('Search')).toHaveValue('cats')
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument()
  })

  it('does not say "No posts yet" on a page past the end when posts exist', () => {
    search.value = 'page=2'
    render(
      <MyPostsView posts={{ items: [], page: 2, perPage: 10, totalItems: 4, totalPages: 1 }} />,
    )
    expect(screen.queryByText('No posts yet')).not.toBeInTheDocument()
    expect(screen.getByText('No posts on this page')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled()
  })
})
