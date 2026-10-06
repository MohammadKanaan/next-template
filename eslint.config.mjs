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
      // Functions are `const` arrow functions everywhere in application code.
      'func-style': ['error', 'expression'],
    },
  },
  // CLI-generated shadcn primitives stay as upstream writes them.
  {
    files: ['components/SCN/**'],
    rules: { 'func-style': 'off' },
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
  // React Hook Form 7 relies on `register()` being called on every render (a reset clears its
  // field registry and the next render refills it). The React Compiler caches that call, so a file
  // that uses the library must opt out, or its form stops following resets and new `values`.
  {
    files: ['app/**/*.tsx', 'components/**/*.tsx', 'hooks/**/*.{ts,tsx}'],
    ignores: ['components/SCN/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Program:has(ImportDeclaration[source.value="react-hook-form"][importKind!="type"]):not(:has(ExpressionStatement[directive="use no memo"]))',
          message:
            "Files that use React Hook Form must opt out of the React Compiler: add 'use no memo' below 'use client'.",
        },
      ],
    },
  },
  // Server code logs through lib/server/logger. The CLI scripts (worker/migrate.ts, prisma/seed.ts)
  // keep console on purpose.
  {
    files: ['lib/data/**/*.ts', 'lib/server/**/*.ts', 'jobs/**/*.ts', 'worker/index.ts'],
    rules: { 'no-console': 'error' },
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
