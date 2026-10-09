import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Sign-up, password reset and email change send emails. No test may reach the real mailer (the
// verification and reset links are read back from the mock's calls); mailer.test.ts loads the real
// module with `vi.importActual`.
vi.mock('@/lib/server/mailer', () => ({
  sendMail: vi.fn(async () => {}),
}))

afterEach(() => cleanup())
