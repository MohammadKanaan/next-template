import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from '@/app/providers'
import { ThemeToggle } from '@/components/ThemeToggle'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.className = ''
  document.documentElement.style.colorScheme = ''
  localStorage.clear()
})

describe('Providers', () => {
  it.each([
    { label: 'Light', preference: 'light', resolved: 'light' },
    { label: 'Dark', preference: 'dark', resolved: 'dark' },
    { label: 'System', preference: 'system', resolved: 'dark' },
  ])(
    'applies and saves the $label choice from the theme menu',
    async ({ label, preference, resolved }) => {
      const user = userEvent.setup()
      render(
        <Providers>
          <ThemeToggle />
        </Providers>,
      )

      screen.getByRole('button', { name: 'Change theme' }).focus()
      await user.keyboard('{Enter}')
      await user.click(await screen.findByRole('menuitemradio', { name: label }))

      await waitFor(() => expect(document.documentElement).toHaveClass(resolved))
      expect(localStorage.getItem('theme')).toBe(preference)
    },
  )

  it('restores a saved dark preference without hiding the app', async () => {
    localStorage.setItem('theme', 'dark')
    render(
      <Providers>
        <p>Application content</p>
      </Providers>,
    )

    expect(screen.getByText('Application content')).toBeVisible()
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'))
  })

  it('uses the system preference when no theme is saved', async () => {
    render(
      <Providers>
        <p>Application content</p>
      </Providers>,
    )

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'))
  })
})
