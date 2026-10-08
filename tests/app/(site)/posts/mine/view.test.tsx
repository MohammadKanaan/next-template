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
vi.mock('@/actions/posts', () => ({ setPostStatusAction: vi.fn() }))

const author = { id: 'u1', name: 'Ada', username: 'ada', website: null }
const draft: PostSummary = {
  id: 1,
  title: 'A draft',
  excerpt: 'e',
  status: 'draft',
  tags: ['news'],
  commentCount: 0,
  createdAt: new Date('2026-10-05T15:04:00.000Z'),
  author,
}
const published: PostSummary = {
  ...draft,
  id: 2,
  title: 'Live post',
  status: 'published',
  tags: [],
  commentCount: 3,
}

const page = (items: PostSummary[]): Page<PostSummary> => {
  return { items, page: 1, perPage: 10, totalItems: items.length, totalPages: 1 }
}

describe('MyPostsView', () => {
  afterEach(() => {
    search.value = ''
  })

  it('shows each post with its status, tags, comment count and only the moves it allows', () => {
    render(<MyPostsView posts={page([draft, published])} tags={[]} />)
    const draftRow = screen.getByRole('row', { name: /A draft/ })
    expect(within(draftRow).getByText('Draft')).toBeInTheDocument()
    expect(within(draftRow).getByText('news')).toBeInTheDocument()
    expect(within(draftRow).getByRole('button', { name: 'Publish' })).toBeInTheDocument()
    expect(within(draftRow).queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
    expect(within(draftRow).getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/posts/u1/1/edit',
    )

    const liveRow = screen.getByRole('row', { name: /Live post/ })
    expect(within(liveRow).getByText('Published')).toBeInTheDocument()
    expect(within(liveRow).getByRole('button', { name: 'Archive' })).toBeInTheDocument()
    expect(within(liveRow).getByRole('button', { name: 'Unpublish' })).toBeInTheDocument()
    expect(within(liveRow).getByRole('link', { name: 'View' })).toHaveAttribute(
      'href',
      '/posts/u1/2',
    )
  })

  it('invites the author to write a first post when there are none', () => {
    render(<MyPostsView posts={page([])} tags={[]} />)
    expect(screen.getByText('No posts yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Write a post' })).toHaveAttribute('href', '/posts/new')
  })

  it('keeps the Trash toggle reachable when the author has no live post', () => {
    // Every post of this author may be in the trash: the toggle is the only way to restore them.
    render(<MyPostsView posts={page([])} tags={[]} />)
    expect(screen.getByText('No posts yet')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Trash' })).toBeInTheDocument()
  })

  it('does not say "No posts yet" on a page past the end when posts exist', () => {
    search.value = 'page=2'
    render(
      <MyPostsView
        posts={{ items: [], page: 2, perPage: 10, totalItems: 4, totalPages: 1 }}
        tags={[]}
      />,
    )
    expect(screen.queryByText('No posts yet')).not.toBeInTheDocument()
    expect(screen.getByText('No posts on this page')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled()
  })

  it('shows the filters with the status select above the posts', () => {
    render(<MyPostsView posts={page([draft])} tags={[{ name: 'news', postCount: 1 }]} />)
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Tag' })).toBeInTheDocument()
    expect(screen.getByLabelText('From')).toBeInTheDocument()
  })

  it('keeps the filters and says nothing matches when a filter finds no posts', () => {
    search.value = 'status=archived&tag=news'
    render(<MyPostsView posts={page([])} tags={[{ name: 'news', postCount: 1 }]} />)
    expect(screen.queryByText('No posts yet')).not.toBeInTheDocument()
    expect(screen.getByText('No matching posts')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Archived')
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })
})
