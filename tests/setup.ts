import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Sign-up and password reset queue emails. No test may reach the real job queue; queue.test.ts
// loads the real module with `vi.importActual`.
vi.mock('@/lib/server/queue', () => ({
  enqueue: vi.fn(async () => null),
  closeQueue: vi.fn(async () => {}),
}))

afterEach(() => cleanup())
