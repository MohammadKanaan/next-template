import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'

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
          patterns: [
            {
              group: ['@/generated/*', '**/generated/prisma/*', '@prisma/*'],
              message: 'Only lib/data may use Prisma. Call a DAL function instead.',
            },
          ],
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
