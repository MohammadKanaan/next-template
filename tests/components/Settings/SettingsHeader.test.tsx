import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SettingsHeader } from '@/components/Settings/SettingsHeader'
import type { CurrentUser } from '@/lib/dto/users'

const user: CurrentUser = {
  id: 'u-ada',
  name: 'Ada Lovelace',
  username: 'ada',
  email: 'ada@example.com',
  emailVerified: true,
  image: null,
  website: null,
  role: 'user',
}

describe('SettingsHeader', () => {
  it('titles the page and says who is signed in, with their role', () => {
    render(<SettingsHeader user={user} />)
    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/Signed in as/)).toHaveTextContent(
      'Signed in as Ada Lovelace · @ada · User',
    )
  })
})
