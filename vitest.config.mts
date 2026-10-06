import { fileURLToPath } from 'node:url'
import babel from '@rolldown/plugin-babel'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  // The React Compiler runs in tests too (as `reactCompiler: true` does in Next), so tests
  // exercise the same memoized code that ships.
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  resolve: {
    tsconfigPaths: true,
    alias: {
      'server-only': fileURLToPath(new URL('./tests/mocks/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    env: loadEnv(mode, process.cwd(), ''),
    fileParallelism: false,
    // Better Auth imports `next/headers.js` itself; inline it so `vi.mock('next/headers')` applies.
    server: { deps: { inline: ['better-auth'] } },
  },
}))
