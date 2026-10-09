import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Sign-up, password reset and email change queue emails. No test may reach the real job queue
// (the verification and reset links are read back from the mock's calls by tests/helpers/mail.ts);
// queue.test.ts loads the real module with `vi.importActual`.
vi.mock('@/lib/server/queue', () => ({
  enqueue: vi.fn(async () => null),
  closeQueue: vi.fn(async () => {}),
}))

afterEach(() => cleanup())
