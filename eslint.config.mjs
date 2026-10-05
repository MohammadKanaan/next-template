import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'

const prismaImportPattern = {
  group: ['@/generated/*', '**/generated/prisma/*', '@prisma/*'],
  message: 'Only lib/data may use Prisma. Call a DAL function instead.',
}

const serverImportPattern = {
  group: ['@/lib/server/*'],
  message: 'lib/server is server-only infrastructure. Reach it through the DAL (lib/data).',
}

const maintenanceImportPattern = {
  group: ['@/lib/data/maintenance', '**/lib/data/maintenance'],
  message:
    'lib/data/maintenance is the system DAL for background jobs. Import it from jobs/** only.',
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      eqeqeq: ['error', 'smart'],
      'no-alert': 'error',
      curly: 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx,mts}'],
    ignores: ['lib/data/**', 'prisma/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [prismaImportPattern, maintenanceImportPattern],
        },
      ],
    },
  },
  // Background jobs (and tests of them) are the only callers of the system DAL.
  {
    files: ['jobs/**/*.ts', 'tests/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [prismaImportPattern] }],
    },
  },
  // UI and request-edge code never imports lib/server directly (it is also guarded at runtime by
  // `server-only`). A later block replaces the rule above, so it repeats the other patterns.
  {
    files: [
      'app/**/*.{ts,tsx}',
      'actions/**/*.ts',
      'components/**/*.{ts,tsx}',
      'hooks/**/*.{ts,tsx}',
      'presenters/**/*.ts',
      'lib/client/**/*.ts',
      'lib/dto/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [prismaImportPattern, serverImportPattern, maintenanceImportPattern],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'generated/**',
    'coverage/**',
    // Generated SQL migrations and synced agent skills.
    'prisma/migrations/**',
    '.agents/**',
    '.claude/**',
    '.cursor/**',
    '.devin/**',
  ]),
])

export default eslintConfig
