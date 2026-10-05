# DAL + Better Auth Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the axios-services → Route Handlers → repositories stack (Prisma 8 RC, hand-rolled sessions) with a
server-only Data Access Layer on Prisma 7.10, Better Auth email/password, Server Actions for writes, and shared Zod DTOs.

**Architecture:** `lib/dto/` holds Zod schemas that are the single source of truth for inputs and outputs (client- and
server-safe). `lib/data/` is the only code that touches Prisma; every DAL function enforces auth itself and returns a
DTO. Server Components call the DAL directly, Server Actions validate then call the DAL, and the one remaining Route
Handler (`GET /api/v1/posts`) calls the same DAL function, fetched by a client facade that parses the response with
the shared schema.

**Tech Stack:** Next.js 16.3 App Router, React 19.2, Prisma ORM 7.10.0 (`prisma-client` generator + `@prisma/adapter-pg`),
Better Auth 1.7.7 (official Prisma adapter, `nextCookies` plugin), Zod 4, React Hook Form, Vitest.

**Spec:** `docs/handoff/2026-10-05-architecture-decisions.md` ("Decided" items 1–15), amended by these user decisions
made on 2026-10-05 (they override the spec where they conflict):

- Auth library: **Better Auth**, **email + password** only.
- ORM: **Prisma 7.10.0 stable** with Better Auth's **official Prisma adapter** (Prisma 8 RC is removed entirely).
- `requireUser()` in the DAL always **throws** `UnauthorizedError`; a thin page-level helper (`loadPage`) turns that
  into a redirect to `/login`. `requireUser()` never calls `redirect()`.
- `/posts/csr` stays as the single live example of the client facade → Route Handler → DAL path, with a test.

## Global Constraints

- Package manager is **bun** (`bun add`, `bun remove`, `bun run …`). Never npm or yarn. Scripts run on Node.
- Pin exactly: `prisma@7.10.0` (dev), `@prisma/client@7.10.0`, `@prisma/adapter-pg@7.10.0`, `better-auth@1.7.7`,
  `pg@8.23.1`, `@types/pg@8.23.1` (dev). No other new runtime dependencies.
- Read `AGENTS.md` before writing code; its conventions (Prettier style, named exports, CSS Modules, no Tailwind
  outside `components/SCN`, no `as` casts in JSX, `@/` imports, `describe`/`it` tests) bind every task.
- Next.js 16 differs from your training data: read the matching guide in `node_modules/next/dist/docs/` before using a
  Next API (`unstable_rethrow`, `refresh`, `revalidatePath`, `redirect`, `notFound`, `proxy.ts`).
- Every file under `lib/data/` starts with `import 'server-only'`. Only `lib/data/**` and `prisma/**` may import
  `@/generated/prisma/*` or `@prisma/*`.
- **Never touch the developer database (`next_template_dev`, from `.env`).** All migration work runs against
  `next_template_test` (from `.env.test`) or a throwaway database you create and drop yourself. The user resets the
  dev DB afterwards.
- `.env` and `.env.test` are untracked local files. You may append the two `BETTER_AUTH_*` variables to them (Task 3);
  do not change or print anything else in them.
- One commit per task, conventional prefix (`feat:`, `refactor:`, `test:`, `docs:`, `chore:`), ending with the line
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Broken window:** Tasks 1–7 delete the legacy layer before the pages are migrated, so `bun run typecheck`,
  `bun run lint`, and `bun run build` are expected to fail **only in files a later task rewrites** (pages, views,
  components listed in Tasks 7–8). Each task must still (a) pass every test file that exists at its commit and
  (b) add no type errors in files it creates or modifies — check with
  `bunx tsc --noEmit 2>&1 | grep -E '<paths you touched>'` (empty output = pass). From Task 8 on, all four checks
  (`typecheck`, `lint`, `test`, `format:check`) must be fully green, and `bun run build` must pass in Tasks 8 and 10.
- Before running server tests the first time in a task, run `bun run db:test:prepare` if the schema changed.

## Shared names (exact; later tasks rely on them)

| Module                     | Exports                                                                                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types/api.ts`             | `FieldErrors`, `ErrorCode`, `ErrorBody`, `ActionFailure`, `ActionResult<T>`                                                                                                                                                         |
| `lib/dto/common.ts`        | `DEFAULT_PER_PAGE`, `MAX_PER_PAGE`, `idSchema`, `pageQuerySchema`, `PageQuery`, `permissionsSchema`, `Permissions`, `Page<T>`, `pageSchema(item)`, `toPage(items, totalItems, query)`                                               |
| `lib/dto/users.ts`         | `roleSchema`, `Role`, `userProfileSchema`, `UserProfile`, `currentUserSchema`, `CurrentUser`                                                                                                                                        |
| `lib/dto/posts.ts`         | `POST_TITLE_MAX_LENGTH`, `POST_BODY_MAX_LENGTH`, `POST_EXCERPT_LENGTH`, `createPostInput`, `CreatePostInput`, `updatePostInput`, `UpdatePostInput`, `listPostsQuery`, `ListPostsQuery`, `postSummarySchema`, `PostSummary`, `postDetailSchema`, `PostDetail` |
| `lib/dto/auth.ts`          | `PASSWORD_MIN_LENGTH`, `PASSWORD_MAX_LENGTH`, `signInInput`, `SignInInput`, `signUpInput`, `SignUpInput`                                                                                                                            |
| `lib/data/db.ts`           | `db` (PrismaClient)                                                                                                                                                                                                                 |
| `lib/data/errors.ts`       | `DataError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ValidationError`, `fieldErrorsFrom`, `parseInput`, `toActionFailure`, `toErrorResponse`                                                                      |
| `lib/data/auth.ts`         | `auth`, `SessionUser`, `getSessionUser`, `requireUser`, `requireAdmin`                                                                                                                                                              |
| `lib/data/users.ts`        | `userProfileSelect`, `getViewer`, `getCurrentUser`, `isUsernameTaken`                                                                                                                                                               |
| `lib/data/posts.ts`        | `toExcerpt`, `listPosts`, `getPost`, `createPost`, `updatePost`, `deletePost`                                                                                                                                                       |
| `lib/data/page.ts`         | `loadPage`                                                                                                                                                                                                                          |
| `actions/posts.ts`         | `createPostAction`, `updatePostAction`, `deletePostAction`                                                                                                                                                                          |
| `actions/auth.ts`          | `signInAction`, `signUpAction`, `signOutAction`                                                                                                                                                                                     |
| `lib/client/posts.ts`      | `RequestError`, `fetchPosts`                                                                                                                                                                                                        |
| `lib/formErrors.ts`        | `applyActionErrors`                                                                                                                                                                                                                 |
| `lib/constants-routes.ts`  | adds `ROUTE_SIGNUP`, `loginPath(next)`                                                                                                                                                                                              |
| `tests/helpers/cookies.ts` | `cookieJar`, `cookieStore`, `requestHeaders()`                                                                                                                                                                                      |
| `tests/helpers/server.ts`  | `TEST_PASSWORD`, `assertTestDatabase`, `resetDatabase`, `createUser`, `signInAs`, `signOut`                                                                                                                                         |

---

### Task 1: Prisma 7.10 schema, client, migration, and seed

Replaces Prisma 8 RC with Prisma 7.10 and deletes the legacy server/data layer that depended on it.

**Files:**

- Delete: `prisma/contract.prisma`, `prisma/contract.json`, `prisma/contract.d.ts`, `prisma/migrations/` (whole
  directory), `prisma/reset-test-db.ts`, `types/models.ts`, `server/` (whole directory), `tests/server/` (whole
  directory), `app/api/v1/auth/`, `app/api/v1/me/`, `app/api/v1/users/`, `app/api/v1/posts/[id]/`,
  `app/api/v1/posts/route.ts` (recreated in Task 6)
- Create: `prisma/schema.prisma`, `prisma/migrations/<timestamp>_init/migration.sql` (generated),
  `prisma/migrations/migration_lock.toml` (generated), `lib/data/db.ts`, `tests/helpers/server.ts` (partial, finished
  in Task 3), `tests/lib/data/db.test.ts`
- Modify: `package.json`, `prisma.config.ts`, `prisma/seed.ts`, `tsconfig.json`, `eslint.config.mjs` (ignores only)

**Interfaces:**

- Produces: `db` from `@/lib/data/db` (a `PrismaClient` from `@/generated/prisma/client`); Prisma models `User`,
  `Session`, `Account`, `Verification`, `Post`, enum `Role { user admin }`; `resetDatabase()` and
  `assertTestDatabase()` in `tests/helpers/server.ts`.

- [ ] **Step 1: Swap packages**

```bash
bun remove @prisma/orm-postgres @prisma/cli-engine prisma
bun add -E @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 pg@8.23.1 better-auth@1.7.7
bun add -dE prisma@7.10.0 @types/pg@8.23.1
```

Then in `package.json` delete the `"overrides"` block (the `@prisma/orm-toolchain` pin) and run `bun install`.
(`better-auth` is installed now because the seed hashes passwords with it.)

- [ ] **Step 2: Replace the scripts in `package.json`**

Remove `contract:emit` and replace the `db:*` / `typecheck` scripts with exactly:

```json
"postinstall": "prisma generate",
"typecheck": "prisma generate && next typegen && tsc --noEmit",
"db:generate": "prisma generate",
"db:migrate": "prisma migrate dev && prisma generate",
"db:deploy": "prisma migrate deploy",
"db:seed": "prisma db seed",
"db:reset": "prisma migrate reset --force && prisma db seed",
"db:studio": "prisma studio",
"db:test:prepare": "DOTENV_CONFIG_PATH=.env.test DOTENV_CONFIG_OVERRIDE=true prisma migrate reset --force"
```

Prisma 7 does not run `generate` or the seed automatically after `migrate dev`/`migrate reset`; the scripts do it
explicitly. `/generated/` is already git-ignored; `postinstall` regenerates it.

- [ ] **Step 3: Write `prisma.config.ts`**

```ts
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
```

`dotenv/config` honours `DOTENV_CONFIG_PATH`, which is how `db:test:prepare` targets `.env.test`.

- [ ] **Step 4: Write `prisma/schema.prisma`**

Field names are camelCase because Better Auth's Prisma adapter addresses fields by these names; `@map` keeps
snake_case columns. `User`/`Session`/`Account`/`Verification` follow Better Auth 1.7.7's core schema
(`node_modules/@better-auth/core/dist/db/get-tables.mjs`) plus our `username`, `phone`, `website`, `role`. IDs of
Better Auth tables are strings generated by Better Auth.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum Role {
  user
  admin
}

model User {
  id            String    @id
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false) @map("email_verified")
  image         String?
  username      String    @unique
  phone         String?
  website       String?
  role          Role      @default(user)
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)
  sessions      Session[]
  accounts      Account[]
  posts         Post[]

  @@map("users")
}

model Session {
  id        String   @id
  token     String   @unique
  expiresAt DateTime @map("expires_at") @db.Timestamptz(3)
  ipAddress String?  @map("ip_address")
  userAgent String?  @map("user_agent")
  userId    String   @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  @@index([userId])
  @@map("sessions")
}

model Account {
  id                    String    @id
  accountId             String    @map("account_id")
  providerId            String    @map("provider_id")
  userId                String    @map("user_id")
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?   @map("access_token")
  refreshToken          String?   @map("refresh_token")
  idToken               String?   @map("id_token")
  accessTokenExpiresAt  DateTime? @map("access_token_expires_at") @db.Timestamptz(3)
  refreshTokenExpiresAt DateTime? @map("refresh_token_expires_at") @db.Timestamptz(3)
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt             DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)

  @@index([userId])
  @@map("accounts")
}

model Verification {
  id         String   @id
  identifier String
  value      String
  expiresAt  DateTime @map("expires_at") @db.Timestamptz(3)
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt  DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  @@index([identifier])
  @@map("verifications")
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  body      String
  userId    String   @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  @@index([userId])
  @@map("posts")
}
```

- [ ] **Step 5: Generate the client and allow `.ts` import extensions**

Run `bunx prisma generate`. Expected: `Generated Prisma Client (7.10.0) to ./generated/prisma`.
The generated client and `prisma/seed.ts` (run by plain Node) import `.ts` files with explicit extensions, so add
`"allowImportingTsExtensions": true` to `compilerOptions` in `tsconfig.json` (valid because `noEmit` is already on).
In `eslint.config.mjs` `globalIgnores`, replace the two Prisma 8 entries (`'prisma/contract.d.ts'`,
`'prisma/migrations/**'`) with `'prisma/migrations/**'` only (`generated/**` is already ignored).

- [ ] **Step 6: Create the init migration against the test database**

The test DB still holds Prisma 8 tables plus a `prisma_contract` schema. Clear it, then create the migration there.
Read the URL from `.env.test` without printing it:

```bash
TEST_URL=$(grep '^DATABASE_URL=' .env.test | cut -d= -f2- | tr -d '"')
psql "$TEST_URL" -c 'DROP SCHEMA IF EXISTS prisma_contract CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
DOTENV_CONFIG_PATH=.env.test DOTENV_CONFIG_OVERRIDE=true bunx prisma migrate dev --name init
```

Expected: `prisma/migrations/<timestamp>_init/migration.sql` and `prisma/migrations/migration_lock.toml` are created
and applied. Open `migration.sql` and confirm it creates `"Role"`, `users`, `sessions`, `accounts`, `verifications`,
`posts`. Then confirm the reset path works: `bun run db:test:prepare` → exit 0.

- [ ] **Step 7: Write `lib/data/db.ts`**

```ts
import 'server-only'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  })
}

const globalForDb = globalThis as unknown as { db?: PrismaClient }

export const db = globalForDb.db ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForDb.db = db
}
```

- [ ] **Step 8: Rewrite `prisma/seed.ts`**

The seed runs on plain Node, outside Next, so it cannot import `lib/data` (`server-only` throws there). It writes the
same rows Better Auth's email sign-up writes: a user plus a `credential` account whose `accountId` is the user id and
whose `password` is Better Auth's scrypt hash.

```ts
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { hashPassword } from 'better-auth/crypto'
import { PrismaClient, type Role } from '../generated/prisma/client.ts'

/** Dev-only password shared by every seeded account. */
const SEED_PASSWORD = 'password123'
const POSTS_PER_USER = 4

const SEED_USERS: {
  name: string
  username: string
  email: string
  phone: string | null
  website: string | null
  role: Role
}[] = [
  {
    name: 'Ada Admin',
    username: 'admin',
    email: 'admin@example.com',
    phone: null,
    website: null,
    role: 'admin',
  },
  {
    name: 'Leanne Graham',
    username: 'leanne',
    email: 'leanne@example.com',
    phone: '1-770-736-8031',
    website: 'hildegard.org',
    role: 'user',
  },
  {
    name: 'Ervin Howell',
    username: 'ervin',
    email: 'ervin@example.com',
    phone: '010-692-6593',
    website: 'anastasia.net',
    role: 'user',
  },
  {
    name: 'Clementine Bauch',
    username: 'clementine',
    email: 'clementine@example.com',
    phone: null,
    website: null,
    role: 'user',
  },
]

// The script owns its client (and disconnects it); `lib/data/db.ts` is server-only.
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

try {
  const password = await hashPassword(SEED_PASSWORD)

  for (const data of SEED_USERS) {
    // Re-seeding replaces the user; sessions, accounts, and posts cascade.
    await db.user.deleteMany({ where: { email: data.email } })

    const id = randomUUID()
    const firstName = data.name.split(' ')[0]
    await db.user.create({
      data: {
        ...data,
        id,
        emailVerified: true,
        accounts: {
          create: { id: randomUUID(), accountId: id, providerId: 'credential', password },
        },
        posts: {
          create: Array.from({ length: POSTS_PER_USER }, (_, index) => ({
            title: `${firstName}'s post #${index + 1}`,
            body: [
              `This is the body of ${firstName}'s post number ${index + 1}.`,
              'It exists so the posts pages have something realistic to render.',
            ].join(' '),
          })),
        },
      },
    })
  }

  console.log(
    `Seeded ${SEED_USERS.length} users (password "${SEED_PASSWORD}") and ` +
      `${SEED_USERS.length * POSTS_PER_USER} posts.`,
  )
} finally {
  await db.$disconnect()
}
```

Verify against the test DB (it is reset again by every test run):
`DOTENV_CONFIG_PATH=.env.test DOTENV_CONFIG_OVERRIDE=true bunx prisma db seed` → prints `Seeded 4 users …`.

- [ ] **Step 9: Write the DB test helpers (`tests/helpers/server.ts`, first half)**

```ts
import { db } from '@/lib/data/db'

export function assertTestDatabase() {
  if (!process.env.DATABASE_URL?.includes('next_template_test')) {
    throw new Error('Server tests must run against next_template_test')
  }
}

export async function resetDatabase() {
  assertTestDatabase()
  await db.$executeRaw`TRUNCATE TABLE posts, sessions, accounts, verifications, users RESTART IDENTITY CASCADE`
}
```

- [ ] **Step 10: Write the failing test `tests/lib/data/db.test.ts`**

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/data/db'
import { resetDatabase } from '../../helpers/server'

describe('database client', () => {
  beforeEach(resetDatabase)
  afterAll(() => db.$disconnect())

  it('targets the test database', () => {
    expect(process.env.DATABASE_URL).toContain('next_template_test')
  })

  it('round-trips a user with Date timestamps and the default role', async () => {
    const user = await db.user.create({
      data: { id: 'u1', name: 'Test', email: 'test@example.com', username: 'test' },
    })
    expect(user.role).toBe('user')
    expect(user.createdAt).toBeInstanceOf(Date)
    expect(await db.user.count()).toBe(1)
  })
})
```

- [ ] **Step 11: Run the tests**

Run: `bun run db:test:prepare && bun run test tests/lib/data/db.test.ts` → PASS (2 tests).
Run: `bun run test` → every remaining test file passes (`tests/server/` was deleted with its subject; the other
legacy tests are deleted by Task 7 together with their subjects).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor: move to Prisma 7.10 with Better Auth tables and a server-only db client"
```

---

### Task 2: Shared Zod DTOs and result types

**Files:**

- Create: `lib/dto/common.ts`, `lib/dto/users.ts`, `lib/dto/posts.ts`, `lib/dto/auth.ts`,
  `tests/lib/dto/common.test.ts`, `tests/lib/dto/posts.test.ts`, `tests/lib/dto/auth.test.ts`
- Modify: `types/api.ts` (replace contents)
- Keep `lib/validation/` for now: `LoginForm` and `PostForm` still import it at runtime and their tests must keep
  passing. Task 7 moves `LoginForm` off it; Task 8 moves `PostForm` off it and deletes the directory.

**Interfaces:**

- Produces: everything listed for `types/api.ts` and `lib/dto/*` in "Shared names". Output schemas use
  `z.coerce.date()` so a client parsing JSON gets `Date` back. Inputs trim strings.

- [ ] **Step 1: Write `types/api.ts`**

```ts
export type FieldErrors = Record<string, string[]>

export type ErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION'

/** Error JSON from Route Handlers; the same fields a failed Server Action returns. */
export type ErrorBody = {
  code: ErrorCode
  message: string
  fieldErrors?: FieldErrors
}

export type ActionFailure = { ok: false } & ErrorBody

export type ActionResult<T> = { ok: true; data: T } | ActionFailure
```

- [ ] **Step 2: Write `lib/dto/common.ts`**

```ts
import { z } from 'zod'

export const DEFAULT_PER_PAGE = 10
export const MAX_PER_PAGE = 100

/** A positive integer id, coerced from a route param or query string. */
export const idSchema = z.coerce.number().int().positive()

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(MAX_PER_PAGE).default(DEFAULT_PER_PAGE),
})

export type PageQuery = z.infer<typeof pageQuerySchema>

export const permissionsSchema = z.object({
  update: z.boolean(),
  delete: z.boolean(),
})

export type Permissions = z.infer<typeof permissionsSchema>

export type Page<T> = {
  items: T[]
  page: number
  perPage: number
  totalItems: number
  totalPages: number
}

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int(),
    perPage: z.number().int(),
    totalItems: z.number().int(),
    totalPages: z.number().int(),
  })
}

export function toPage<T>(items: T[], totalItems: number, { page, perPage }: PageQuery): Page<T> {
  return { items, page, perPage, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / perPage)) }
}
```

- [ ] **Step 3: Write `lib/dto/users.ts`**

```ts
import { z } from 'zod'

export const roleSchema = z.enum(['user', 'admin'])

export type Role = z.infer<typeof roleSchema>

/** What anyone may see about a user (e.g. a post's author). */
export const userProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  website: z.string().nullable(),
})

export type UserProfile = z.infer<typeof userProfileSchema>

/** The signed-in user's own record. */
export const currentUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  email: z.string(),
  role: roleSchema,
})

export type CurrentUser = z.infer<typeof currentUserSchema>
```

- [ ] **Step 4: Write `lib/dto/posts.ts`**

Messages are copied from the deleted `lib/validation/posts.ts` so existing form tests keep their expectations.

```ts
import { z } from 'zod'
import { pageQuerySchema, permissionsSchema } from './common'
import { userProfileSchema } from './users'

export const POST_TITLE_MAX_LENGTH = 200
export const POST_BODY_MAX_LENGTH = 5000
export const POST_EXCERPT_LENGTH = 160

export const createPostInput = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(POST_TITLE_MAX_LENGTH, `Title must be ${POST_TITLE_MAX_LENGTH} characters or fewer`),
  body: z
    .string()
    .trim()
    .min(1, 'Body is required')
    .max(POST_BODY_MAX_LENGTH, `Body must be ${POST_BODY_MAX_LENGTH} characters or fewer`),
})

export type CreatePostInput = z.infer<typeof createPostInput>

export const updatePostInput = createPostInput
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one attribute')

export type UpdatePostInput = z.infer<typeof updatePostInput>

export const listPostsQuery = pageQuerySchema.extend({
  authorId: z.string().min(1).optional(),
})

export type ListPostsQuery = z.infer<typeof listPostsQuery>

/** List variant: excerpt instead of body. */
export const postSummarySchema = z.object({
  id: z.number().int(),
  title: z.string(),
  excerpt: z.string(),
  createdAt: z.coerce.date(),
  author: userProfileSchema,
})

export type PostSummary = z.infer<typeof postSummarySchema>

/** Detail variant: full body, timestamps, and what the viewer may do. */
export const postDetailSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  body: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  author: userProfileSchema,
  permissions: permissionsSchema,
})

export type PostDetail = z.infer<typeof postDetailSchema>
```

- [ ] **Step 5: Write `lib/dto/auth.ts`**

```ts
import { z } from 'zod'

/** Better Auth's defaults; `lib/data/auth.ts` passes the minimum through. */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .pipe(z.email('Enter a valid email address'))

export const signInInput = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
})

export type SignInInput = z.infer<typeof signInInput>

export const signUpInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or fewer'),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be 30 characters or fewer')
    .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers, and underscores'),
  email,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(PASSWORD_MAX_LENGTH, `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer`),
})

export type SignUpInput = z.infer<typeof signUpInput>
```

- [ ] **Step 6: Write the tests**

`tests/lib/dto/common.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { idSchema, MAX_PER_PAGE, pageQuerySchema, pageSchema, toPage } from '@/lib/dto/common'

describe('pageQuerySchema', () => {
  it('defaults missing values and coerces query strings', () => {
    expect(pageQuerySchema.parse({})).toEqual({ page: 1, perPage: 10 })
    expect(pageQuerySchema.parse({ page: '3', perPage: '5' })).toEqual({ page: 3, perPage: 5 })
  })

  it('rejects zero, negatives, non-numbers, and oversized pages', () => {
    for (const input of [{ page: '0' }, { page: '-1' }, { page: 'abc' }, { perPage: MAX_PER_PAGE + 1 }]) {
      expect(pageQuerySchema.safeParse(input).success).toBe(false)
    }
  })
})

describe('idSchema', () => {
  it('accepts positive integer strings only', () => {
    expect(idSchema.parse('7')).toBe(7)
    expect(idSchema.safeParse('abc').success).toBe(false)
    expect(idSchema.safeParse('1.5').success).toBe(false)
  })
})

describe('toPage', () => {
  it('computes total pages and never reports zero pages', () => {
    expect(toPage(['a', 'b'], 5, { page: 1, perPage: 2 })).toEqual({
      items: ['a', 'b'],
      page: 1,
      perPage: 2,
      totalItems: 5,
      totalPages: 3,
    })
    expect(toPage([], 0, { page: 1, perPage: 10 }).totalPages).toBe(1)
  })

  it('round-trips through pageSchema', () => {
    const page = toPage([1, 2], 2, { page: 1, perPage: 10 })
    expect(pageSchema(z.number()).parse(page)).toEqual(page)
  })
})
```

`tests/lib/dto/posts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createPostInput, postSummarySchema, updatePostInput } from '@/lib/dto/posts'

describe('post inputs', () => {
  it('trims and requires title and body', () => {
    expect(createPostInput.parse({ title: ' Hi ', body: ' There ' })).toEqual({ title: 'Hi', body: 'There' })
    const result = createPostInput.safeParse({ title: '  ', body: '' })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Title is required',
      'Body is required',
    ])
  })

  it('requires at least one attribute to update', () => {
    expect(updatePostInput.safeParse({}).success).toBe(false)
    expect(updatePostInput.parse({ title: 'New' })).toEqual({ title: 'New' })
  })
})

describe('postSummarySchema', () => {
  it('turns ISO strings from JSON back into Dates', () => {
    const summary = postSummarySchema.parse({
      id: 1,
      title: 'T',
      excerpt: 'E',
      createdAt: '2026-10-05T10:00:00.000Z',
      author: { id: 'u1', name: 'N', username: 'n', website: null },
    })
    expect(summary.createdAt).toEqual(new Date('2026-10-05T10:00:00.000Z'))
  })
})
```

`tests/lib/dto/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { signInInput, signUpInput } from '@/lib/dto/auth'

describe('auth inputs', () => {
  it('normalises the email', () => {
    expect(signInInput.parse({ email: ' Leanne@Example.com ', password: 'x' }).email).toBe(
      'leanne@example.com',
    )
  })

  it('reports each invalid sign-up field', () => {
    const result = signUpInput.safeParse({ name: '', username: 'A!', email: 'nope', password: 'short' })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([
      'name',
      'username',
      'username',
      'email',
      'password',
    ])
  })
})
```

If the exact issue list in the last assertion differs because Zod 4 aborts a chain early, assert on the set of
paths instead (`new Set(...)` equals `{name, username, email, password}`) — the point is that every field reports.

- [ ] **Step 7: Run tests**

Run: `bun run test tests/lib/dto` → PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: shared Zod DTOs for posts, users, auth, and pagination"
```

---

### Task 3: Typed errors and Better Auth in the DAL

**Files:**

- Create: `lib/data/errors.ts`, `lib/data/auth.ts`, `app/api/auth/[...all]/route.ts`, `tests/helpers/cookies.ts`,
  `tests/lib/data/errors.test.ts`, `tests/lib/data/auth.test.ts`
- Modify: `tests/helpers/server.ts` (add auth helpers), `.env.example`, `.env.test.example`, local `.env` and
  `.env.test` (append only)

**Interfaces:**

- Consumes: `db`; `roleSchema`, `Role`, `PASSWORD_MIN_LENGTH`; `ErrorCode`, `ErrorBody`, `ActionFailure`,
  `FieldErrors`.
- Produces: error classes and translators (`toActionFailure(error): ActionFailure` — rethrows Next control-flow
  errors and unknown errors; `toErrorResponse(error): NextResponse<ErrorBody>` — rethrows unknown errors;
  `parseInput(schema, input)` — `safeParse`, throws `ValidationError` with `fieldErrors`); `auth` (Better Auth
  instance); `SessionUser = { id: string; role: Role }`; `getSessionUser(): Promise<SessionUser | null>` (React
  `cache()`d); `requireUser(): Promise<SessionUser>`; `requireAdmin(): Promise<SessionUser>`.

- [ ] **Step 1: Add the Better Auth environment variables**

Append to `.env.example` and `.env.test.example`:

```
# Better Auth: generate the secret with `openssl rand -base64 32`.
BETTER_AUTH_SECRET="replace-with-a-32+-character-random-string"
BETTER_AUTH_URL="http://localhost:3000"
```

Append the same two keys to the local `.env` and `.env.test`, with a real secret from `openssl rand -base64 32`
(one secret per file). Do not print the files.

- [ ] **Step 2: Write `lib/data/errors.ts`**

```ts
import 'server-only'
import { unstable_rethrow } from 'next/navigation'
import { NextResponse } from 'next/server'
import type { z } from 'zod'
import type { ActionFailure, ErrorBody, ErrorCode, FieldErrors } from '@/types/api'

/** Base for the errors the DAL throws; callers translate them per transport. */
export class DataError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fieldErrors?: FieldErrors,
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class UnauthorizedError extends DataError {
  constructor(message = 'Sign in to continue') {
    super('UNAUTHORIZED', message)
  }
}

export class ForbiddenError extends DataError {
  constructor(message = 'You are not allowed to do that') {
    super('FORBIDDEN', message)
  }
}

export class NotFoundError extends DataError {
  constructor(message = 'Not found') {
    super('NOT_FOUND', message)
  }
}

export class ValidationError extends DataError {
  constructor(fieldErrors: FieldErrors, message = 'Validation failed') {
    super('VALIDATION', message, fieldErrors)
  }
}

export function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {}
  for (const issue of error.issues) {
    const field = issue.path.join('.') || 'base'
    ;(errors[field] ??= []).push(issue.message)
  }
  return errors
}

/** `safeParse` that throws a `ValidationError` carrying per-field messages. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new ValidationError(fieldErrorsFrom(result.error))
  }
  return result.data
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
}

function toErrorBody(error: DataError): ErrorBody {
  return error.fieldErrors
    ? { code: error.code, message: error.message, fieldErrors: error.fieldErrors }
    : { code: error.code, message: error.message }
}

/** Server Actions: a typed DAL error becomes a failed result; anything else propagates. */
export function toActionFailure(error: unknown): ActionFailure {
  unstable_rethrow(error)
  if (error instanceof DataError) {
    return { ok: false, ...toErrorBody(error) }
  }
  throw error
}

/** Route Handlers: a typed DAL error becomes its status code; anything else propagates (500). */
export function toErrorResponse(error: unknown) {
  if (error instanceof DataError) {
    return NextResponse.json(toErrorBody(error), { status: STATUS_BY_CODE[error.code] })
  }
  throw error
}
```

- [ ] **Step 3: Write `lib/data/auth.ts`**

```ts
import 'server-only'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { headers } from 'next/headers'
import { cache } from 'react'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/lib/dto/auth'
import { roleSchema, type Role } from '@/lib/dto/users'
import { db } from './db'
import { ForbiddenError, UnauthorizedError } from './errors'

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
  },
  user: {
    additionalFields: {
      username: { type: 'string', required: true },
      role: { type: ['user', 'admin'], required: false, defaultValue: 'user', input: false },
    },
  },
  // nextCookies must stay the last plugin: it writes Set-Cookie through next/headers in Server Actions.
  plugins: [nextCookies()],
})

export type SessionUser = { id: string; role: Role }

/** The signed-in user, or null. Deduplicated within one React render (not in Route Handlers). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return null
  }
  return { id: session.user.id, role: roleSchema.parse(session.user.role) }
})

/** Throws `UnauthorizedError` when signed out. Never redirects; pages use `loadPage` for that. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) {
    throw new UnauthorizedError()
  }
  return user
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (user.role !== 'admin') {
    throw new ForbiddenError()
  }
  return user
}
```

Confirm `maxPasswordLength` exists in `node_modules/@better-auth/core/dist/types/init-options.d.mts`
(`emailAndPassword`); if it does not, drop that line and `PASSWORD_MAX_LENGTH` stays a client-side limit only.

- [ ] **Step 4: Write `app/api/auth/[...all]/route.ts`** (Better Auth's official Next.js handler; serves its own
      `/api/auth/*` endpoints, e.g. for a future client SDK or OAuth callbacks)

```ts
import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/data/auth'

export const { GET, POST } = toNextJsHandler(auth)
```

- [ ] **Step 5: Write `tests/helpers/cookies.ts`** (no app imports, so test files can load it inside `vi.hoisted`
      before `next/headers` is mocked)

```ts
/** In-memory stand-in for the browser's cookies across mocked `cookies()` / `headers()` calls. */
export const cookieJar = new Map<string, string>()

export const cookieStore = {
  get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
  getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
  has: (name: string) => cookieJar.has(name),
  set: (name: string, value: string) => {
    cookieJar.set(name, value)
  },
  delete: (name: string) => {
    cookieJar.delete(name)
  },
}

/** Request headers as a browser would send them back, encoded the way Next serialises cookies. */
export function requestHeaders() {
  const cookie = [...cookieJar]
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('; ')
  return new Headers(cookie ? { cookie } : {})
}
```

Every server test file that touches auth mocks Next like this (copy verbatim):

```ts
const { cookieStore, requestHeaders } = await vi.hoisted(async () => import('../../helpers/cookies'))
vi.mock('next/headers', () => ({ cookies: async () => cookieStore, headers: async () => requestHeaders() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))
```

(Adjust the relative path to `tests/helpers/cookies` per file depth.) Better Auth's `nextCookies` plugin imports
`next/headers.js`; Vitest resolves both specifiers to the same file, so one mock covers both. If Step 9's sign-in test
shows an empty jar, add an identical `vi.mock('next/headers.js', …)` and note it in your report.

- [ ] **Step 6: Finish `tests/helpers/server.ts`** (append below the Task 1 helpers)

```ts
import type { Role } from '@/lib/dto/users'
import { auth } from '@/lib/data/auth'
import { cookieJar } from './cookies'

export const TEST_PASSWORD = 'correct-horse-battery'

/** Signs a user up through Better Auth (real password hash and account row), then signs out locally. */
export async function createUser(
  overrides: Partial<{ name: string; username: string; email: string; role: Role }> = {},
) {
  const suffix = Math.random().toString(36).slice(2, 8)
  const email = overrides.email ?? `${suffix}@example.com`
  await auth.api.signUpEmail({
    body: {
      name: overrides.name ?? `User ${suffix}`,
      username: overrides.username ?? `user_${suffix}`,
      email,
      password: TEST_PASSWORD,
    },
  })
  cookieJar.clear()
  return db.user.update({ where: { email }, data: { role: overrides.role ?? 'user' } })
}

export async function signInAs(user: { email: string }) {
  cookieJar.clear()
  await auth.api.signInEmail({ body: { email: user.email, password: TEST_PASSWORD } })
}

export function signOut() {
  cookieJar.clear()
}
```

Move the imports to the top of the file and make `resetDatabase()` also call `cookieJar.clear()`.

- [ ] **Step 7: Write `tests/lib/data/errors.test.ts`**

```ts
// @vitest-environment node
import { redirect } from 'next/navigation'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  ForbiddenError,
  NotFoundError,
  parseInput,
  toActionFailure,
  toErrorResponse,
  UnauthorizedError,
  ValidationError,
} from '@/lib/data/errors'

describe('parseInput', () => {
  it('returns parsed data or throws field errors', () => {
    const schema = z.object({ title: z.string().trim().min(1, 'Title is required') })
    expect(parseInput(schema, { title: ' a ' })).toEqual({ title: 'a' })
    try {
      parseInput(schema, { title: ' ' })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).fieldErrors).toEqual({ title: ['Title is required'] })
    }
  })
})

describe('toActionFailure', () => {
  it('maps typed errors to a failed result', () => {
    expect(toActionFailure(new ForbiddenError('No'))).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      message: 'No',
    })
    expect(toActionFailure(new ValidationError({ body: ['Body is required'] }))).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Validation failed',
      fieldErrors: { body: ['Body is required'] },
    })
  })

  it('rethrows unknown errors and Next redirects', () => {
    expect(() => toActionFailure(new Error('boom'))).toThrow('boom')
    let redirectError: unknown
    try {
      redirect('/login')
    } catch (error) {
      redirectError = error
    }
    expect(() => toActionFailure(redirectError)).toThrow()
  })
})

describe('toErrorResponse', () => {
  it('maps codes to statuses', async () => {
    const cases = [
      [new UnauthorizedError(), 401],
      [new ForbiddenError(), 403],
      [new NotFoundError(), 404],
      [new ValidationError({}), 422],
    ] as const
    for (const [error, status] of cases) {
      const response = toErrorResponse(error)
      expect(response.status).toBe(status)
      expect(await response.json()).toMatchObject({ code: error.code, message: error.message })
    }
  })

  it('rethrows unknown errors', () => {
    expect(() => toErrorResponse(new Error('boom'))).toThrow('boom')
  })
})
```

- [ ] **Step 8: Write `tests/lib/data/auth.test.ts`**

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSessionUser, requireAdmin, requireUser } from '@/lib/data/auth'
import { db } from '@/lib/data/db'
import { ForbiddenError, UnauthorizedError } from '@/lib/data/errors'
import { cookieJar } from '../../helpers/cookies'
import { createUser, resetDatabase, signInAs } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(async () => import('../../helpers/cookies'))
vi.mock('next/headers', () => ({ cookies: async () => cookieStore, headers: async () => requestHeaders() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

describe('DAL auth', () => {
  beforeEach(resetDatabase)
  afterAll(() => db.$disconnect())

  it('treats a request without a session as signed out', async () => {
    expect(await getSessionUser()).toBeNull()
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('treats a forged cookie as signed out', async () => {
    cookieJar.set('better-auth.session_token', 'forged.value')
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('returns the signed-in user id and role', async () => {
    const user = await createUser({})
    await signInAs(user)
    expect(cookieJar.size).toBeGreaterThan(0)
    expect(await requireUser()).toEqual({ id: user.id, role: 'user' })
  })

  it('only lets admins through requireAdmin', async () => {
    const member = await createUser({})
    await signInAs(member)
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError)

    const admin = await createUser({ role: 'admin' })
    await signInAs(admin)
    expect(await requireAdmin()).toEqual({ id: admin.id, role: 'admin' })
  })
})
```

Note: `getSessionUser` is wrapped in React `cache()`. Outside a React server render (as in Vitest), `cache` does not
memoise, so successive calls in one test see the current cookie. If it does memoise in your environment, the last
test fails; report that rather than working around it.

- [ ] **Step 9: Run tests**

Run: `bun run test tests/lib/data` → PASS. Better Auth logs schema-validation problems at startup
(`advanced.database.validateSchema` defaults to true); the test output must contain none. If it reports a mismatch,
fix `prisma/schema.prisma` to match Better Auth (and regenerate the migration as in Task 1 Step 6), not the other way
round.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: Better Auth email/password with typed DAL errors and requireUser/requireAdmin"
```

---

### Task 4: Posts and users DAL, plus the page loader

**Files:**

- Create: `lib/data/users.ts`, `lib/data/posts.ts`, `lib/data/page.ts`, `tests/lib/data/users.test.ts`,
  `tests/lib/data/posts.test.ts`, `tests/lib/data/page.test.ts`
- Modify: `lib/constants-routes.ts` (add `ROUTE_SIGNUP`, `loginPath`), `tests/lib/constants-routes.test.ts`

**Interfaces:**

- Consumes: `db`, `getSessionUser`, `requireUser`, `SessionUser`, error classes, DTO types, `toPage`.
- Produces:
  - `userProfileSelect` (Prisma select for `UserProfile`)
  - `getViewer(): Promise<CurrentUser | null>` (cached; no throw)
  - `getCurrentUser(): Promise<CurrentUser>` (throws `UnauthorizedError`)
  - `isUsernameTaken(username: string): Promise<boolean>`
  - `toExcerpt(body: string, maxLength?: number): string`
  - `listPosts(query: ListPostsQuery): Promise<Page<PostSummary>>` (public, newest first)
  - `getPost(id: number): Promise<PostDetail>` (public; `NotFoundError`; permissions for the viewer)
  - `createPost(input: CreatePostInput): Promise<PostDetail>` (signed in)
  - `updatePost(id: number, input: UpdatePostInput): Promise<PostDetail>` (owner or admin)
  - `deletePost(id: number): Promise<void>` (owner or admin)
  - `loadPage<T>(load: () => Promise<T>, path: string): Promise<T>`
  - `ROUTE_SIGNUP = '/signup'`, `loginPath(next: string): string`

Order of checks for writes: `requireUser()` first (401 before revealing whether a post exists), then 404, then 403.

- [ ] **Step 1: Route constants**

In `lib/constants-routes.ts` add `export const ROUTE_SIGNUP = '/signup'`, include it in `PUBLIC_ROUTES`, and add:

```ts
export const loginPath = (next: string) => `${ROUTE_LOGIN}?next=${encodeURIComponent(next)}`
```

Extend `tests/lib/constants-routes.test.ts`: add `'/signup'` to the public paths list and a case
`expect(loginPath('/posts/new?x=1')).toBe('/login?next=%2Fposts%2Fnew%3Fx%3D1')`.

- [ ] **Step 2: Write `lib/data/users.ts`**

```ts
import 'server-only'
import { cache } from 'react'
import type { Prisma } from '@/generated/prisma/client'
import type { CurrentUser } from '@/lib/dto/users'
import { getSessionUser } from './auth'
import { db } from './db'
import { UnauthorizedError } from './errors'

/** Selects exactly the `UserProfile` DTO; the row is the DTO, so drift fails to compile. */
export const userProfileSelect = {
  id: true,
  name: true,
  username: true,
  website: true,
} satisfies Prisma.UserSelect

const currentUserSelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  role: true,
} satisfies Prisma.UserSelect

/** The signed-in user's record, or null when signed out (e.g. for the nav bar). */
export const getViewer = cache(async (): Promise<CurrentUser | null> => {
  const sessionUser = await getSessionUser()
  if (!sessionUser) {
    return null
  }
  return db.user.findUnique({ where: { id: sessionUser.id }, select: currentUserSelect })
})

export async function getCurrentUser(): Promise<CurrentUser> {
  const viewer = await getViewer()
  if (!viewer) {
    throw new UnauthorizedError()
  }
  return viewer
}

export async function isUsernameTaken(username: string) {
  return (await db.user.count({ where: { username } })) > 0
}
```

- [ ] **Step 3: Write `lib/data/posts.ts`**

```ts
import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { toPage, type Page } from '@/lib/dto/common'
import {
  POST_EXCERPT_LENGTH,
  type CreatePostInput,
  type ListPostsQuery,
  type PostDetail,
  type PostSummary,
  type UpdatePostInput,
} from '@/lib/dto/posts'
import { getSessionUser, requireUser, type SessionUser } from './auth'
import { db } from './db'
import { ForbiddenError, NotFoundError } from './errors'
import { userProfileSelect } from './users'

const postSummarySelect = {
  id: true,
  title: true,
  body: true,
  createdAt: true,
  user: { select: userProfileSelect },
} satisfies Prisma.PostSelect

const postDetailSelect = {
  id: true,
  title: true,
  body: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  user: { select: userProfileSelect },
} satisfies Prisma.PostSelect

type PostSummaryRow = Prisma.PostGetPayload<{ select: typeof postSummarySelect }>
type PostDetailRow = Prisma.PostGetPayload<{ select: typeof postDetailSelect }>

export function toExcerpt(body: string, maxLength = POST_EXCERPT_LENGTH) {
  return body.length <= maxLength ? body : `${body.slice(0, maxLength).trimEnd()}…`
}

/** Record-level rule: the author or an admin may change a post. */
function canModify(viewer: SessionUser | null, authorId: string) {
  return viewer !== null && (viewer.id === authorId || viewer.role === 'admin')
}

function toPostSummary(row: PostSummaryRow): PostSummary {
  return {
    id: row.id,
    title: row.title,
    excerpt: toExcerpt(row.body),
    createdAt: row.createdAt,
    author: row.user,
  }
}

function toPostDetail(row: PostDetailRow, viewer: SessionUser | null): PostDetail {
  const allowed = canModify(viewer, row.userId)
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: row.user,
    permissions: { update: allowed, delete: allowed },
  }
}

export async function listPosts({ page, perPage, authorId }: ListPostsQuery): Promise<Page<PostSummary>> {
  const where: Prisma.PostWhereInput = authorId ? { userId: authorId } : {}
  const [rows, totalItems] = await Promise.all([
    db.post.findMany({
      where,
      select: postSummarySelect,
      orderBy: { id: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.post.count({ where }),
  ])
  return toPage(rows.map(toPostSummary), totalItems, { page, perPage })
}

export async function getPost(id: number): Promise<PostDetail> {
  const [row, viewer] = await Promise.all([
    db.post.findUnique({ where: { id }, select: postDetailSelect }),
    getSessionUser(),
  ])
  if (!row) {
    throw new NotFoundError('Post not found')
  }
  return toPostDetail(row, viewer)
}

export async function createPost(input: CreatePostInput): Promise<PostDetail> {
  const viewer = await requireUser()
  const row = await db.post.create({
    data: { ...input, userId: viewer.id },
    select: postDetailSelect,
  })
  return toPostDetail(row, viewer)
}

/** Signed in, post exists, and the viewer may change it — in that order. */
async function requirePostChange(id: number) {
  const viewer = await requireUser()
  const post = await db.post.findUnique({ where: { id }, select: { userId: true } })
  if (!post) {
    throw new NotFoundError('Post not found')
  }
  if (!canModify(viewer, post.userId)) {
    throw new ForbiddenError('You cannot change this post')
  }
  return viewer
}

export async function updatePost(id: number, input: UpdatePostInput): Promise<PostDetail> {
  const viewer = await requirePostChange(id)
  const row = await db.post.update({ where: { id }, data: input, select: postDetailSelect })
  return toPostDetail(row, viewer)
}

export async function deletePost(id: number): Promise<void> {
  await requirePostChange(id)
  await db.post.delete({ where: { id } })
}
```

- [ ] **Step 4: Write `lib/data/page.ts`**

```ts
import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { loginPath } from '@/lib/constants-routes'
import { NotFoundError, UnauthorizedError } from './errors'

/**
 * Runs a DAL read for a Server Component page. Signed out → login (returning to `path`),
 * missing record → the not-found page. Other errors propagate to the error boundary.
 */
export async function loadPage<T>(load: () => Promise<T>, path: string): Promise<T> {
  try {
    return await load()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect(loginPath(path))
    }
    if (error instanceof NotFoundError) {
      notFound()
    }
    throw error
  }
}
```

- [ ] **Step 5: Write `tests/lib/data/posts.test.ts`**

Use the mock header from Task 3 Step 5. Cases (write each as its own `it`):

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import { ForbiddenError, NotFoundError, UnauthorizedError } from '@/lib/data/errors'
import { createPost, deletePost, getPost, listPosts, toExcerpt, updatePost } from '@/lib/data/posts'
import { createUser, resetDatabase, signInAs, signOut } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(async () => import('../../helpers/cookies'))
vi.mock('next/headers', () => ({ cookies: async () => cookieStore, headers: async () => requestHeaders() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

async function seedPost(userId: string, title = 'Post', body = 'Body') {
  return db.post.create({ data: { userId, title, body } })
}

describe('posts DAL', () => {
  beforeEach(resetDatabase)
  afterAll(() => db.$disconnect())

  it('lists newest first as a Page of summaries with an excerpt and author', async () => {
    const author = await createUser({ name: 'Leanne Graham' })
    for (const n of [1, 2, 3]) {
      await seedPost(author.id, `Post ${n}`, 'x'.repeat(200))
    }
    const page = await listPosts({ page: 1, perPage: 2 })
    expect(page).toMatchObject({ page: 1, perPage: 2, totalItems: 3, totalPages: 2 })
    expect(page.items.map((post) => post.title)).toEqual(['Post 3', 'Post 2'])
    expect(page.items[0].excerpt).toBe(`${'x'.repeat(160)}…`)
    expect(page.items[0].createdAt).toBeInstanceOf(Date)
    expect(page.items[0].author).toEqual({
      id: author.id,
      name: 'Leanne Graham',
      username: author.username,
      website: null,
    })
    expect(page.items[0]).not.toHaveProperty('body')
  })

  it('filters by author', async () => {
    const a = await createUser({})
    const b = await createUser({})
    await seedPost(a.id)
    await seedPost(b.id)
    const page = await listPosts({ page: 1, perPage: 10, authorId: b.id })
    expect(page.items.map((post) => post.author.id)).toEqual([b.id])
  })

  it('throws NotFoundError for a missing post', async () => {
    await expect(getPost(999)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('computes permissions for anonymous, other, owner, and admin viewers', async () => {
    const owner = await createUser({})
    const other = await createUser({})
    const admin = await createUser({ role: 'admin' })
    const post = await seedPost(owner.id)

    signOut()
    expect((await getPost(post.id)).permissions).toEqual({ update: false, delete: false })
    await signInAs(other)
    expect((await getPost(post.id)).permissions).toEqual({ update: false, delete: false })
    await signInAs(owner)
    expect((await getPost(post.id)).permissions).toEqual({ update: true, delete: true })
    await signInAs(admin)
    expect((await getPost(post.id)).permissions).toEqual({ update: true, delete: true })
  })

  it('requires a session to create, and creates as the viewer', async () => {
    await expect(createPost({ title: 'T', body: 'B' })).rejects.toBeInstanceOf(UnauthorizedError)
    const user = await createUser({})
    await signInAs(user)
    const post = await createPost({ title: 'T', body: 'B' })
    expect(post).toMatchObject({ title: 'T', author: { id: user.id }, permissions: { update: true } })
  })

  it('checks session, then existence, then ownership on update', async () => {
    const owner = await createUser({})
    const intruder = await createUser({})
    const post = await seedPost(owner.id)

    signOut()
    await expect(updatePost(999, { title: 'x' })).rejects.toBeInstanceOf(UnauthorizedError)
    await signInAs(intruder)
    await expect(updatePost(999, { title: 'x' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(updatePost(post.id, { title: 'x' })).rejects.toBeInstanceOf(ForbiddenError)
    await signInAs(owner)
    expect(await updatePost(post.id, { title: 'Renamed' })).toMatchObject({
      title: 'Renamed',
      body: 'Body',
    })
  })

  it('lets an admin update and delete someone else’s post', async () => {
    const owner = await createUser({})
    const admin = await createUser({ role: 'admin' })
    const post = await seedPost(owner.id)
    await signInAs(admin)
    expect((await updatePost(post.id, { body: 'Moderated' })).body).toBe('Moderated')
    await deletePost(post.id)
    expect(await db.post.count()).toBe(0)
  })

  it('forbids a non-owner from deleting', async () => {
    const owner = await createUser({})
    const intruder = await createUser({})
    const post = await seedPost(owner.id)
    await signInAs(intruder)
    await expect(deletePost(post.id)).rejects.toBeInstanceOf(ForbiddenError)
    expect(await db.post.count()).toBe(1)
  })

  it('truncates long bodies and trims whitespace before the ellipsis', () => {
    expect(toExcerpt('short')).toBe('short')
    expect(toExcerpt('abc   def', 6)).toBe('abc…')
  })
})
```

- [ ] **Step 6: Write `tests/lib/data/users.test.ts`**

Same mock header. Cases: `getViewer()` is `null` when signed out; after `signInAs(user)` it equals
`{ id, name, username, email, role: 'user' }` exactly (no other keys); `getCurrentUser()` rejects with
`UnauthorizedError` when signed out; `isUsernameTaken` is `true` for an existing username and `false` otherwise.

- [ ] **Step 7: Write `tests/lib/data/page.test.ts`**

```ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ForbiddenError, NotFoundError, UnauthorizedError } from '@/lib/data/errors'
import { loadPage } from '@/lib/data/page'

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))

describe('loadPage', () => {
  it('returns the loaded value', async () => {
    expect(await loadPage(async () => 42, '/x')).toBe(42)
  })

  it('redirects signed-out users to login with the page as next', async () => {
    await expect(
      loadPage(async () => {
        throw new UnauthorizedError()
      }, '/posts/new'),
    ).rejects.toThrow('REDIRECT /login?next=%2Fposts%2Fnew')
  })

  it('renders not-found for missing records', async () => {
    await expect(
      loadPage(async () => {
        throw new NotFoundError()
      }, '/x'),
    ).rejects.toThrow('NOT_FOUND')
  })

  it('lets other errors through', async () => {
    const error = new ForbiddenError()
    await expect(
      loadPage(async () => {
        throw error
      }, '/x'),
    ).rejects.toBe(error)
  })
})
```

- [ ] **Step 8: Run tests and commit**

Run: `bun run test tests/lib` → PASS.

```bash
git add -A
git commit -m "feat: posts and users DAL with owner-or-admin rules and a page loader"
```

---

### Task 5: Server Actions

**Files:**

- Create: `actions/posts.ts`, `actions/auth.ts`, `tests/actions/posts.test.ts`, `tests/actions/auth.test.ts`

**Interfaces:**

- Consumes: DAL functions, `parseInput`, `toActionFailure`, `ValidationError`, DTO inputs, `auth`, `idSchema`,
  `ROUTE_POSTS`.
- Produces:
  - `createPostAction(input: CreatePostInput): Promise<ActionResult<PostDetail>>`
  - `updatePostAction(id: number, input: UpdatePostInput): Promise<ActionResult<PostDetail>>`
  - `deletePostAction(id: number): Promise<ActionResult<null>>`
  - `signInAction(input: SignInInput): Promise<ActionResult<null>>`
  - `signUpAction(input: SignUpInput): Promise<ActionResult<null>>`
  - `signOutAction(): Promise<ActionResult<null>>`

Inputs are typed for callers but re-validated: anything can reach a Server Action endpoint.

- [ ] **Step 1: Write `actions/posts.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { ROUTE_POSTS } from '@/lib/constants-routes'
import { parseInput, toActionFailure } from '@/lib/data/errors'
import { createPost, deletePost, updatePost } from '@/lib/data/posts'
import { idSchema } from '@/lib/dto/common'
import {
  createPostInput,
  updatePostInput,
  type CreatePostInput,
  type PostDetail,
  type UpdatePostInput,
} from '@/lib/dto/posts'
import type { ActionResult } from '@/types/api'

export async function createPostAction(input: CreatePostInput): Promise<ActionResult<PostDetail>> {
  try {
    const post = await createPost(parseInput(createPostInput, input))
    revalidatePath(ROUTE_POSTS, 'layout')
    return { ok: true, data: post }
  } catch (error) {
    return toActionFailure(error)
  }
}

export async function updatePostAction(
  id: number,
  input: UpdatePostInput,
): Promise<ActionResult<PostDetail>> {
  try {
    const post = await updatePost(parseInput(idSchema, id), parseInput(updatePostInput, input))
    revalidatePath(ROUTE_POSTS, 'layout')
    return { ok: true, data: post }
  } catch (error) {
    return toActionFailure(error)
  }
}

export async function deletePostAction(id: number): Promise<ActionResult<null>> {
  try {
    await deletePost(parseInput(idSchema, id))
    revalidatePath(ROUTE_POSTS, 'layout')
    return { ok: true, data: null }
  } catch (error) {
    return toActionFailure(error)
  }
}
```

- [ ] **Step 2: Write `actions/auth.ts`**

```ts
'use server'

import { APIError } from 'better-auth/api'
import { refresh } from 'next/cache'
import { headers } from 'next/headers'
import { auth } from '@/lib/data/auth'
import { parseInput, toActionFailure, ValidationError } from '@/lib/data/errors'
import { isUsernameTaken } from '@/lib/data/users'
import { signInInput, signUpInput, type SignInInput, type SignUpInput } from '@/lib/dto/auth'
import type { ActionResult } from '@/types/api'

export async function signInAction(input: SignInInput): Promise<ActionResult<null>> {
  try {
    const body = parseInput(signInInput, input)
    await auth.api.signInEmail({ body, headers: await headers() })
    refresh()
    return { ok: true, data: null }
  } catch (error) {
    if (error instanceof APIError && error.status === 'UNAUTHORIZED') {
      return { ok: false, code: 'UNAUTHORIZED', message: 'Invalid email or password' }
    }
    return toActionFailure(error)
  }
}

export async function signUpAction(input: SignUpInput): Promise<ActionResult<null>> {
  try {
    const body = parseInput(signUpInput, input)
    if (await isUsernameTaken(body.username)) {
      throw new ValidationError({ username: ['That username is taken'] })
    }
    await auth.api.signUpEmail({ body, headers: await headers() })
    refresh()
    return { ok: true, data: null }
  } catch (error) {
    if (error instanceof APIError && error.body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
      return toActionFailure(
        new ValidationError({ email: ['An account with this email already exists'] }),
      )
    }
    return toActionFailure(error)
  }
}

export async function signOutAction(): Promise<ActionResult<null>> {
  await auth.api.signOut({ headers: await headers() })
  refresh()
  return { ok: true, data: null }
}
```

`signUpEmail` signs the new user in (Better Auth's `autoSignIn` default), and `nextCookies` writes the session
cookie. Verify `APIError` is exported from `better-auth/api` and the sign-up duplicate code is
`USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` in `node_modules/better-auth/dist/api/routes/sign-up.mjs`.

- [ ] **Step 3: Write `tests/actions/posts.test.ts`**

Same mock header as Task 3 Step 5 (path `'../helpers/cookies'`), and import `revalidatePath` from `next/cache` to
assert on the mock. Cases:

1. Signed out: `createPostAction({ title: 'T', body: 'B' })` →
   `{ ok: false, code: 'UNAUTHORIZED', message: 'Sign in to continue' }`; `revalidatePath` not called.
2. Signed in, invalid input `{ title: ' ', body: '' }` →
   `{ ok: false, code: 'VALIDATION', message: 'Validation failed', fieldErrors: { title: ['Title is required'], body: ['Body is required'] } }`;
   no post created.
3. Signed in, valid → `ok: true`, `data.title === 'Hello'` (input `' Hello '`), `data.createdAt` is a `Date`,
   `revalidatePath` called with `('/posts', 'layout')`.
4. `updatePostAction(id, {})` → `code: 'VALIDATION'` with `fieldErrors.base` equal to
   `['Provide at least one attribute']`.
5. `updatePostAction(0, { title: 'x' })` → `code: 'VALIDATION'` (bad id never reaches the DAL).
6. Intruder `updatePostAction(post.id, { title: 'x' })` → `code: 'FORBIDDEN'`.
7. Owner `deletePostAction(post.id)` → `{ ok: true, data: null }` and the post is gone; a second call →
   `code: 'NOT_FOUND'`.

Call `vi.mocked(revalidatePath).mockClear()` in `beforeEach`.

- [ ] **Step 4: Write `tests/actions/auth.test.ts`**

Same mock header. Cases:

1. `signUpAction({ name: 'New', username: 'newbie', email: 'New@Example.com', password: 'long-enough-1' })` →
   `{ ok: true, data: null }`; then `requireUser()` resolves and the stored user has email `new@example.com` and
   role `user`.
2. Sign-up with a taken username (from `createUser({ username: 'taken' })`) →
   `fieldErrors: { username: ['That username is taken'] }`.
3. Sign-up with a taken email → `fieldErrors: { email: ['An account with this email already exists'] }`.
4. Sign-up with `password: 'short'` → `code: 'VALIDATION'` with a `password` field error; no user created.
5. `signInAction` with a wrong password →
   `{ ok: false, code: 'UNAUTHORIZED', message: 'Invalid email or password' }`; the cookie jar has no session.
6. `signInAction` with mixed-case email and `TEST_PASSWORD` → `ok: true`; `requireUser()` returns the user.
7. `signOutAction()` after signing in → `ok: true`; `requireUser()` now rejects with `UnauthorizedError`, and
   `db.session.count()` is `0`.
8. `refresh` (mocked from `next/cache`) is called once per successful sign-in, sign-up, and sign-out.

- [ ] **Step 5: Run tests and commit**

Run: `bun run test tests/actions` → PASS.

```bash
git add -A
git commit -m "feat: Server Actions for posts and auth returning ActionResult"
```

---

### Task 6: Posts Route Handler and client facade

**Files:**

- Create: `app/api/v1/posts/route.ts`, `lib/client/posts.ts`, `tests/app/api/v1/posts.test.ts`,
  `tests/lib/client/posts.test.ts`

**Interfaces:**

- Consumes: `listPosts`, `parseInput`, `toErrorResponse`, `listPostsQuery`, `pageSchema`, `postSummarySchema`,
  `env.apiBaseUrl` (default `/api/v1`).
- Produces: `GET /api/v1/posts?page&perPage&authorId` → `Page<PostSummary>` JSON (dates as ISO strings) or
  `ErrorBody` with 422; `fetchPosts(query: ListPostsQuery, signal?: AbortSignal): Promise<Page<PostSummary>>`;
  `class RequestError extends Error { status: number }`.

- [ ] **Step 1: Write `app/api/v1/posts/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { parseInput, toErrorResponse } from '@/lib/data/errors'
import { listPosts } from '@/lib/data/posts'
import { listPostsQuery } from '@/lib/dto/posts'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = parseInput(listPostsQuery, Object.fromEntries(searchParams))
    return NextResponse.json(await listPosts(query))
  } catch (error) {
    return toErrorResponse(error)
  }
}
```

- [ ] **Step 2: Write `lib/client/posts.ts`**

```ts
import { z } from 'zod'
import { pageSchema, type Page } from '@/lib/dto/common'
import { postSummarySchema, type ListPostsQuery, type PostSummary } from '@/lib/dto/posts'
import { env } from '@/lib/env'

const postsPageSchema = pageSchema(postSummarySchema)
const errorMessageSchema = z.object({ message: z.string() })

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'RequestError'
  }
}

/**
 * Client facade for `GET /api/v1/posts`. Parses with the shared schema, so the caller gets the
 * same `Page<PostSummary>` (with `Date`s) that Server Components get from the DAL.
 */
export async function fetchPosts(
  query: ListPostsQuery,
  signal?: AbortSignal,
): Promise<Page<PostSummary>> {
  const params = new URLSearchParams({ page: String(query.page), perPage: String(query.perPage) })
  if (query.authorId) {
    params.set('authorId', query.authorId)
  }
  const response = await fetch(`${env.apiBaseUrl}/posts?${params}`, { signal })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const parsed = errorMessageSchema.safeParse(body)
    throw new RequestError(
      parsed.success ? parsed.data.message : `Request failed (${response.status})`,
      response.status,
    )
  }
  return postsPageSchema.parse(body)
}
```

- [ ] **Step 3: Write `tests/app/api/v1/posts.test.ts`**

Same mock header (path `'../../../helpers/cookies'`). Cases: `GET /api/v1/posts?page=1&perPage=2` with 3 seeded posts
→ 200 and body `{ page: 1, perPage: 2, totalItems: 3, totalPages: 2 }` with two items whose `createdAt` is an ISO
string; `?page=0` → 422 with body `{ code: 'VALIDATION', message: 'Validation failed', fieldErrors: { page: [...] } }`
(assert `fieldErrors.page` has length 1); `?authorId=<id>` returns only that author's posts.

- [ ] **Step 4: Write `tests/lib/client/posts.test.ts`** — the end-to-end test for path 3 (facade → Route Handler →
      DAL → test DB)

```ts
// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/v1/posts/route'
import { fetchPosts, RequestError } from '@/lib/client/posts'
import { db } from '@/lib/data/db'
import { createUser, resetDatabase } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(async () => import('../../helpers/cookies'))
vi.mock('next/headers', () => ({ cookies: async () => cookieStore, headers: async () => requestHeaders() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

describe('fetchPosts', () => {
  beforeEach(async () => {
    await resetDatabase()
    // Route the facade's relative fetch straight into the real Route Handler.
    vi.stubGlobal('fetch', (input: string, init?: RequestInit) =>
      GET(new Request(new URL(input, 'http://localhost'), init)),
    )
  })
  afterEach(() => vi.unstubAllGlobals())
  afterAll(() => db.$disconnect())

  it('returns the same Page<PostSummary> the DAL returns, with Dates restored', async () => {
    const author = await createUser({})
    await db.post.create({ data: { userId: author.id, title: 'Hello', body: 'World' } })
    const page = await fetchPosts({ page: 1, perPage: 9 })
    expect(page).toMatchObject({ page: 1, perPage: 9, totalItems: 1, totalPages: 1 })
    expect(page.items[0]).toMatchObject({ title: 'Hello', excerpt: 'World', author: { id: author.id } })
    expect(page.items[0].createdAt).toBeInstanceOf(Date)
  })

  it('throws a RequestError carrying the server message and status', async () => {
    const error = await fetchPosts({ page: 0, perPage: 9 }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(RequestError)
    expect(error).toMatchObject({ status: 422, message: 'Validation failed' })
  })
})
```

- [ ] **Step 5: Run tests and commit**

Run: `bun run test tests/app tests/lib/client` → PASS.

```bash
git add -A
git commit -m "feat: posts Route Handler and client facade parsed with the shared schema"
```

---

### Task 7: Auth UI, proxy, layout, and removal of the client data stack

**Files:**

- Create: `lib/formErrors.ts`, `tests/lib/formErrors.test.ts`, `components/Auth/SignUpForm/index.tsx`,
  `components/Auth/SignUpForm/styles.module.scss`, `components/Auth/SignOutButton/index.tsx`,
  `app/(minimal)/signup/page.tsx`, `app/(minimal)/signup/view.tsx`, `tests/components/Auth/SignUpForm.test.tsx`,
  `tests/proxy.test.ts`
- Modify: `proxy.ts`, `components/Auth/LoginForm/index.tsx`, `app/(minimal)/login/view.tsx`,
  `app/(site)/layout.tsx`, `components/Layout/NavBar/index.tsx` (+ its `styles.module.scss` for mobile account
  controls), `app/(site)/private/page.tsx`, `app/providers.tsx`, `tests/components/Auth/LoginForm.test.tsx`
- Delete: `app/(site)/private/view.tsx`, `components/Auth/UserBootstrap/`, `stores/`, `services/`, `hooks/useApiData.ts`,
  `lib/apiCall.ts`, `lib/queryKeys.ts`, `lib/errorMessage.ts`, `lib/constants-auth.ts`, and their tests
  (`tests/stores/`, `tests/services/`, `tests/lib/apiCall.test.ts`, `tests/lib/errorMessage.test.ts`)

**Interfaces:**

- Consumes: `signInAction`, `signUpAction`, `signOutAction`, `getViewer`, `getCurrentUser`, `loadPage`,
  `CurrentUser`, `SignInInput`, `SignUpInput`, `ActionResult`, `ActionFailure`.
- Produces: `applyActionErrors<T>(failure: ActionFailure, fields: readonly Path<T>[], setError: UseFormSetError<T>)`;
  `LoginForm` props `{ onSubmit: (values: SignInInput) => Promise<ActionResult<unknown>> }`; `SignUpForm` props
  `{ onSubmit: (values: SignUpInput) => Promise<ActionResult<unknown>> }`; `SignOutButton` (no props);
  `NavBar` props `{ user: CurrentUser | null }`.

- [ ] **Step 1: Write `lib/formErrors.ts`** (shared by every form; replaces per-form mapping)

```ts
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import type { ActionFailure } from '@/types/api'

/** Puts a failed action's field errors on the matching fields, or its message on `root.server`. */
export function applyActionErrors<T extends FieldValues>(
  failure: ActionFailure,
  fields: readonly Path<T>[],
  setError: UseFormSetError<T>,
) {
  let matched = false
  for (const field of fields) {
    const message = failure.fieldErrors?.[field]?.[0]
    if (message) {
      setError(field, { type: 'server', message })
      matched = true
    }
  }
  if (!matched) {
    setError('root.server', { type: 'server', message: failure.message })
  }
}
```

Test (`tests/lib/formErrors.test.ts`, jsdom): with a `vi.fn()` as `setError`, (a) field errors for known fields are
set and `root.server` is not; (b) a field error for an unknown field (`base`) falls back to `root.server` with the
message; (c) no `fieldErrors` → `root.server`.

- [ ] **Step 2: Update `LoginForm`**

Fields: `email` (type email, autoComplete `email`) and `password` (type password, autoComplete `current-password`),
schema `signInInput`, default values `{ email: '', password: '' }`. On submit: `const result = await onSubmit(values)`;
if `!result.ok`, `applyActionErrors(result, ['email', 'password'], setError)`. Keep the existing root error markup and
submit button (`Sign in`). Replace the hint with
`Dev login: leanne@example.com / password123 (admin: admin@example.com).` and add a line
`No account? <Link href={ROUTE_SIGNUP}>Sign up</Link>` styled by a new `.footer` class in the form's
`styles.module.scss`.

Update `tests/components/Auth/LoginForm.test.tsx`: the validation test types `nope` into Email and expects
`Enter a valid email address` and `Password is required`, with `onSubmit` not called; the failure test resolves
`{ ok: false, code: 'UNAUTHORIZED', message: 'Invalid email or password' }`, expects `onSubmit` called with
`{ email: 'who@example.com', password: 'secret' }` and the alert text `Invalid email or password`.

- [ ] **Step 3: Update the login view**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { signInAction } from '@/actions/auth'
import { LoginForm } from '@/components/Auth/LoginForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/SCN/card'
import type { SignInInput } from '@/lib/dto/auth'
import styles from './styles.module.scss'

type LoginViewProps = {
  nextPath: string
}

export function LoginView({ nextPath }: LoginViewProps) {
  const router = useRouter()

  const handleSubmit = async (values: SignInInput) => {
    const result = await signInAction(values)
    if (result.ok) {
      router.replace(nextPath)
    }
    return result
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Card>
          <CardHeader>
            <CardTitle>Log in</CardTitle>
            <CardDescription>Use your email and password.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm onSubmit={handleSubmit} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Sign-up form, page, and view**

`components/Auth/SignUpForm/index.tsx` mirrors `LoginForm`: schema `signUpInput`, fields `name` (Name,
autoComplete `name`), `username` (Username, autoComplete `username`), `email`, `password` (autoComplete
`new-password`), all `required`; `applyActionErrors(result, ['name', 'username', 'email', 'password'], setError)`;
submit label `Create account`; footer `Already have an account? <Link href={ROUTE_LOGIN}>Log in</Link>`.
`app/(minimal)/signup/page.tsx` mirrors the login page (metadata title `Sign up`, reads `next` with
`safeRedirectPath`), and `view.tsx` mirrors `LoginView` with `signUpAction`, title `Create an account`, description
`Sign up with your email and a password.` Reuse the login route's `styles.module.scss` by importing
`'../login/styles.module.scss'`.

Test `tests/components/Auth/SignUpForm.test.tsx`: (a) empty submit shows `Name is required`,
`Username must be at least 3 characters`, `Email is required`, `Password must be at least 8 characters` and does not
call `onSubmit`; (b) a resolved `{ ok: false, code: 'VALIDATION', message: 'Validation failed', fieldErrors: { username: ['That username is taken'] } }`
shows `That username is taken` next to Username.

- [ ] **Step 5: `SignOutButton`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { signOutAction } from '@/actions/auth'
import { Button } from '@/components/SCN/button'
import { ROUTE_HOME } from '@/lib/constants-routes'

export function SignOutButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    startTransition(async () => {
      await signOutAction()
      router.push(ROUTE_HOME)
    })
  }

  return (
    <Button type="button" variant="outline" size="sm" loading={isPending} onClick={handleClick}>
      Log out
    </Button>
  )
}
```

- [ ] **Step 6: Layout and NavBar read the viewer on the server**

`app/(site)/layout.tsx` becomes async: `const viewer = await getViewer()` and renders `<NavBar user={viewer} />`.
`NavBar` takes `{ user }: { user: CurrentUser | null }`, drops the Zustand store, `toast`, `handleLogout`,
`hasLoadedProfile`, and renders in the desktop account area either `user.name` + `<SignOutButton />` or a `Log in`
button linking to `ROUTE_LOGIN`. Fix the carried-over gap: the mobile menu gets the same account area below its
links (a `mobileAccountArea` class in the NavBar's SCSS, using existing tokens) — signed-in shows the name and
`<SignOutButton />`, signed-out shows `Log in` (closing the menu on click).

- [ ] **Step 7: Private page on the server**

`app/(site)/private/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { SignOutButton } from '@/components/Auth/SignOutButton'
import { ROUTE_PRIVATE } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { getCurrentUser } from '@/lib/data/users'
import styles from './styles.module.scss'

export const metadata: Metadata = {
  title: 'Private',
}

export default async function PrivatePage() {
  const user = await loadPage(getCurrentUser, ROUTE_PRIVATE)

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>This page is private and requires authentication.</h1>
      <div className={styles.profile}>
        <p className={styles.meta}>
          <strong>Name:</strong> {user.name}
        </p>
        <p className={styles.meta}>
          <strong>Username:</strong> {user.username}
        </p>
        <p className={styles.meta}>
          <strong>Email:</strong> {user.email}
        </p>
        <p className={styles.meta}>
          <strong>Role:</strong> {user.role}
        </p>
        <div>
          <SignOutButton />
        </div>
      </div>
    </div>
  )
}
```

Delete `app/(site)/private/view.tsx`.

- [ ] **Step 8: Providers without TanStack Query**

`app/providers.tsx` keeps `'use client'`, `TooltipProvider`, and `Toaster`; remove `QueryClientProvider`,
`QueryClient`, `useState`, and `UserBootstrap`.

- [ ] **Step 9: Proxy on Better Auth's cookie**

```ts
import { getSessionCookie } from 'better-auth/cookies'
import { NextResponse, type NextRequest } from 'next/server'
import { ROUTE_HOME, ROUTE_LOGIN, ROUTE_SIGNUP, isPrivateRoute } from '@/lib/constants-routes'

const GUEST_ONLY_ROUTES: string[] = [ROUTE_LOGIN, ROUTE_SIGNUP]

/** Optimistic redirects from cookie presence only. Real checks live in the DAL. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const hasSession = getSessionCookie(request) !== null

  if (!hasSession && isPrivateRoute(pathname)) {
    const url = new URL(ROUTE_LOGIN, request.url)
    url.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(url)
  }

  if (hasSession && GUEST_ONLY_ROUTES.includes(pathname)) {
    return NextResponse.redirect(new URL(ROUTE_HOME, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
```

`tests/proxy.test.ts` (node env): build `new NextRequest('http://localhost/private')` → 307 to
`/login?next=%2Fprivate`; same request with header `cookie: better-auth.session_token=abc.def` → passes through
(`x-middleware-next` header `1`); `/signup` with that cookie → redirect to `/`; `/posts` without cookie → passes.

- [ ] **Step 10: Delete the client data stack**

Delete the files listed under "Delete" for this task. `git grep -nE "useUserStore|@/services/|apiCall|useApiData|queryKeys|errorMessage|constants-auth"`
must only match files Task 8 rewrites (posts views, Card, Grid, Form, utils, ui-kit).

- [ ] **Step 11: Run tests and commit**

Run: `bun run test` → PASS for all existing files. Typecheck errors may remain only in Task 8 files.

```bash
git add -A
git commit -m "feat: Better Auth login, sign-up, and sign-out UI with server-read viewer"
```

---

### Task 8: Posts pages on the DAL and Server Actions

**Files:**

- Create: `app/(site)/posts/[userId]/[id]/view.tsx` (rewrite), `components/Posts/DeleteButton/index.tsx`
- Modify: `app/(site)/posts/page.tsx` (copy only), `app/(site)/posts/ssr/page.tsx`, `app/(site)/posts/csr/view.tsx`,
  `app/(site)/posts/new/view.tsx`, `app/(site)/posts/[userId]/[id]/page.tsx`,
  `app/(site)/posts/[userId]/[id]/edit/page.tsx`, `app/(site)/posts/[userId]/[id]/edit/view.tsx`,
  `components/Posts/Card/index.tsx`, `components/Posts/Grid/index.tsx`, `components/Posts/Form/index.tsx`,
  `components/Posts/Form/utils.ts`, `presenters/UserPresenter.ts`, `app/(site)/ui-kit/view.tsx` (PostForm example),
  `tests/components/Posts/PostForm.test.tsx`, `tests/components/Posts/utils.test.ts`,
  `tests/presenters/UserPresenter.test.ts`
- Delete: `lib/validation/` (whole directory; nothing imports it after this task)

**Interfaces:**

- Consumes: `listPosts`, `getPost`, `loadPage`, `fetchPosts`, `RequestError`, post actions, `applyActionErrors`,
  `idSchema`, `PostSummary`, `PostDetail`, `CreatePostInput`, `UpdatePostInput`, `ActionResult`.
- Produces: `PostsGrid({ posts: PostSummary[] })`, `PostsCard({ post: PostSummary })`,
  `PostForm({ post: PostDetail | null, submitLabel, onSubmit: (values: CreatePostInput) => Promise<ActionResult<unknown>>, onCancel? })`,
  `buildPostAttributes(values: CreatePostInput, post: PostDetail | null): Partial<CreatePostInput>`,
  `hydratePostForm(post: PostDetail | null): CreatePostInput`, `POST_FORM_FIELDS = ['title', 'body'] as const`,
  `presentUser<T extends { website: string | null }>(user: T): T`, `DeletePostButton({ postId: number })`.

- [ ] **Step 1: Presenter and form utils**

`presenters/UserPresenter.ts`: change the generic bound to `<T extends { website: string | null }>`; drop the
`UsersService` import. Update `tests/presenters/UserPresenter.test.ts` to build its fixture as a `UserProfile`
(`{ id: 'u1', name, username, website }`) and keep every existing case (the "extra fields" case uses `email`).

`components/Posts/Form/utils.ts`:

```ts
import type { CreatePostInput, PostDetail } from '@/lib/dto/posts'

export const POST_FORM_FIELDS = ['title', 'body'] as const

export const EMPTY_POST_FORM: CreatePostInput = { title: '', body: '' }

export function hydratePostForm(post: PostDetail | null): CreatePostInput {
  return post ? { title: post.title, body: post.body } : { ...EMPTY_POST_FORM }
}

/** New post: every field. Existing post: only the fields that changed. */
export function buildPostAttributes(
  values: CreatePostInput,
  post: PostDetail | null,
): Partial<CreatePostInput> {
  const original = hydratePostForm(post)
  const attributes: Partial<CreatePostInput> = {}
  for (const field of POST_FORM_FIELDS) {
    if (post === null || values[field] !== original[field]) {
      attributes[field] = values[field]
    }
  }
  return attributes
}
```

Update `tests/components/Posts/utils.test.ts` to the new types (fixture is a `PostDetail` with `Date`s and an
`author`) and drop the `isPostFormField` cases.

- [ ] **Step 2: `PostForm`**

Props per Interfaces. Schema `createPostInput`. On submit: `const result = await onSubmit(formValues)`; if
`!result.ok`, `applyActionErrors(result, POST_FORM_FIELDS, setError)`. Markup unchanged. Update
`tests/components/Posts/PostForm.test.tsx`: fixtures become `ActionResult` (`{ ok: true, data: null }`,
`{ ok: false, code: 'VALIDATION', message: 'Validation failed', fieldErrors: { title: ['Title is taken'] } }`,
`{ ok: false, code: 'FORBIDDEN', message: 'You cannot change this post' }`) and the `post` fixture becomes a
`PostDetail`. Every existing case keeps its intent. Update the ui-kit `PostForm` example to return
`{ ok: true, data: null }`.

- [ ] **Step 3: `PostsCard` and `PostsGrid`**

`PostsCard({ post }: { post: PostSummary })` renders the title, `#id` pill, `post.excerpt` (no client truncation —
delete `truncate` and `maxBodyChars`), a `by {post.author.name}` line (new `.byline` class with existing tokens), and
the `View` link to `ROUTE_POST_DETAILS(post.author.id, post.id)`. `PostsGrid` takes `PostSummary[]`.

- [ ] **Step 4: SSR page**

```tsx
// app/(site)/posts/ssr/page.tsx — only the data lines change:
import { listPosts } from '@/lib/data/posts'
// …
export default async function PostsSsrPage() {
  // Render at request time so `next build` never queries the database.
  await connection()

  const { items } = await listPosts({ page: 1, perPage: 9 })
  // …PostsState empty={items.length === 0} … <PostsGrid posts={items} />
}
```

Description copy: `Server Component calling the DAL directly`.

- [ ] **Step 5: CSR view on the client facade** (no TanStack Query; the view owns its fetch effect)

```tsx
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { PostsGrid } from '@/components/Posts/Grid'
import { PostsState } from '@/components/Posts/State'
import { Button } from '@/components/SCN/button'
import { fetchPosts, RequestError } from '@/lib/client/posts'
import { ROUTE_POSTS, ROUTE_POSTS_SSR } from '@/lib/constants-routes'
import type { Page } from '@/lib/dto/common'
import type { PostSummary } from '@/lib/dto/posts'
import styles from '../styles.module.scss'

const PER_PAGE = 9

type LoadResult = { key: string; data: Page<PostSummary> | null; errorMessage: string }

function toErrorMessage(error: unknown) {
  return error instanceof RequestError ? error.message : 'Could not load posts. Check your connection.'
}

export function PostsCsrView() {
  const [page, setPage] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<LoadResult | null>(null)
  const requestKey = `${page}:${attempt}`

  useEffect(() => {
    const controller = new AbortController()
    fetchPosts({ page, perPage: PER_PAGE }, controller.signal).then(
      (data) => setResult({ key: requestKey, data, errorMessage: '' }),
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, data: null, errorMessage: toErrorMessage(error) })
        }
      },
    )
    return () => controller.abort()
  }, [page, requestKey])

  // A result for an older page/attempt counts as still loading.
  const loaded = result?.key === requestKey ? result : null
  const isLoading = loaded === null
  const data = loaded?.data ?? null
  const errorMessage = loaded?.errorMessage ?? ''
  const posts = data?.items ?? []

  return (
    <div className={styles.page}>
      <PageHeader
        title="Posts (CSR)"
        description="Fetched in the browser through the client facade and Route Handler"
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={ROUTE_POSTS}>Back</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href={ROUTE_POSTS_SSR}>View SSR page</Link>
            </Button>
          </>
        }
      />
      <PostsState
        loading={isLoading}
        empty={!isLoading && !errorMessage && posts.length === 0}
        emptyMessage="No posts found."
        errorMessage={errorMessage}
        onRetry={() => setAttempt((value) => value + 1)}
      >
        <PostsGrid posts={posts} />
        <Pagination
          page={page}
          totalPages={data?.totalPages ?? 1}
          onPageChange={setPage}
          disabled={isLoading}
        />
      </PostsState>
    </div>
  )
}
```

- [ ] **Step 6: Post detail page and view**

`app/(site)/posts/[userId]/[id]/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { ROUTE_POST_DETAILS } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { getPost } from '@/lib/data/posts'
import { idSchema } from '@/lib/dto/common'
import { PostDetailView } from './view'

export const metadata: Metadata = {
  title: 'Post details',
}

export default async function PostDetailPage({ params }: PageProps<'/posts/[userId]/[id]'>) {
  const { userId, id } = await params
  const postId = idSchema.safeParse(id)
  if (!postId.success) {
    notFound()
  }

  const post = await loadPage(() => getPost(postId.data), ROUTE_POST_DETAILS(userId, id))
  if (post.author.id !== userId) {
    redirect(ROUTE_POST_DETAILS(post.author.id, post.id))
  }

  return <PostDetailView post={post} />
}
```

`view.tsx` (`'use client'`) takes `{ post: PostDetail }`, computes `const author = useMemo(() => presentUser(post.author), [post])`,
and renders the existing two cards (post, author) without the loading/error/refresh machinery: header actions are
`Back`, `Edit` (when `post.permissions.update`), and `<DeletePostButton postId={post.id} />` (when
`post.permissions.delete`). Show `Post ID` and `Author ID` (`post.author.id`) in the meta line.

`components/Posts/DeleteButton/index.tsx` (`'use client'`): a `destructive`-variant `Delete` button that opens the
SCN `Dialog` ("Delete this post?" / "This cannot be undone.") with `Cancel` (`DialogClose`) and a confirming
`Delete` button. Confirm runs `deletePostAction(postId)` in `useTransition`; on `ok` → `toast.success('Post deleted')`
and `router.push(ROUTE_POSTS)`; on failure → `toast.error(result.message)`. Check `components/SCN/button.tsx` for the
destructive variant name.

- [ ] **Step 7: New and edit**

`posts/new/view.tsx`: `handleSubmit = async (values: CreatePostInput) => { const result = await createPostAction(values); if (result.ok) { toast.success('Post created'); router.push(ROUTE_POST_DETAILS(result.data.author.id, result.data.id)) } return result }`.
Remove `useQueryClient`, `sFetch`, and the `as` cast.

`posts/[userId]/[id]/edit/page.tsx`:

```tsx
export default async function PostEditPage({ params }: PageProps<'/posts/[userId]/[id]/edit'>) {
  const { userId, id } = await params
  const postId = idSchema.safeParse(id)
  if (!postId.success) {
    notFound()
  }

  const post = await loadPage(() => getPost(postId.data), ROUTE_POST_EDIT(userId, id))
  if (!post.permissions.update) {
    return (
      <Empty
        title="You cannot edit this post"
        description="Only the author or an admin can change it."
        action={
          <Button asChild variant="secondary">
            <Link href={ROUTE_POST_DETAILS(post.author.id, post.id)}>Back to post</Link>
          </Button>
        }
      />
    )
  }

  return <PostEditView post={post} />
}
```

`edit/view.tsx` takes `{ post: PostDetail }` and renders the header and `PostForm`. Its `handleSubmit`: build
attributes with `buildPostAttributes(values, post)`; if empty → `toast('No changes to save')` and return
`{ ok: true, data: null }`; else `const result = await updatePostAction(post.id, attributes)`; on `ok` →
`toast.success('Post updated')` and `router.push(ROUTE_POST_DETAILS(result.data.author.id, result.data.id))`; return
`result`. No `useApiData`, `queryClient`, or `PostsState`.

`app/(site)/posts/page.tsx`: update card copy — SSR: `Server Component calling the DAL directly.`; CSR:
`Client component fetching /api/v1/posts through a typed facade.`; Write: `Create a post with a Server Action.
Requires a login.`

- [ ] **Step 8: Full verification**

```bash
bun run typecheck
bun run lint
bun run format:check   # run `bun run format` first if it fails, then re-check
bun run test
bun run build
```

All five must pass with no errors. Then grep must be empty:
`git grep -nE "useUserStore|@/services/|apiCall|useApiData|queryKeys|lib/validation|@/server/|types/models|Listing|ApiResponse"`
(excluding `docs/`).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: posts pages read the DAL and write through Server Actions"
```

---

### Task 9: Lint guard and dependency cleanup

**Files:**

- Modify: `eslint.config.mjs`, `package.json`

- [ ] **Step 1: Block Prisma imports outside the DAL**

Add to the `defineConfig([...])` array, after the main rules block:

```js
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
```

Verify it fires and does not fire:

```bash
printf "import { PrismaClient } from '@/generated/prisma/client'\nexport const x = PrismaClient\n" \
  | bunx eslint --stdin --stdin-filename components/Example.tsx   # expect: 1 error, no-restricted-imports
printf "import { PrismaClient } from '@/generated/prisma/client'\nexport const x = PrismaClient\n" \
  | bunx eslint --stdin --stdin-filename lib/data/example.ts      # expect: no no-restricted-imports error
```

- [ ] **Step 2: Remove unused dependencies**

```bash
bun remove axios @tanstack/react-query zustand
```

Then `git grep -nE "from '(axios|@tanstack/react-query|zustand)'"` → empty.

- [ ] **Step 3: Verify and commit**

Run `bun run lint && bun run typecheck && bun run test` → all pass.

```bash
git add -A
git commit -m "chore: block Prisma imports outside the DAL and drop unused client data deps"
```

---

### Task 10: Documentation and clean-database replay

**Files:**

- Modify: `AGENTS.md`, `docs/DECISIONS.md`, `README.md`

- [ ] **Step 1: `AGENTS.md`**

Keep the `nextjs-agent-rules` block at the top untouched. Directly under `# AGENTS.md — Next Template`, add a
`## The One-Contract Rule` section with this text:

> Every data path ends at the same DAL function and returns the same DTO type under the same auth rules:
> Server Component → `lib/data`; Server Action (`actions/`) → `lib/data`; client facade (`lib/client`) → Route
> Handler (`app/api/v1`) → `lib/data`. DTOs are Zod schemas in `lib/dto` (`z.infer` gives the types). The DAL is the
> only code that touches Prisma, and it enforces auth itself (`requireUser()` / `requireAdmin()` plus inline
> record-level rules), so a caller that forgets a check cannot bypass it.

Then rewrite these sections to match the code (remove everything about axios services, `ApiResponse`, `sFetch`,
TanStack Query, `useApiData`, `queryKeys`, Zustand, repositories/serializers, the Prisma 8 contract, the `Uauth`
cookie, and "no postinstall"):

- **Build & Run Commands** table: the Task 1 scripts (`db:generate`, `db:migrate`, `db:deploy`, `db:seed`,
  `db:reset`, `db:test:prepare`), plus a note that `postinstall` runs `prisma generate` into git-ignored `generated/`.
- **Tech Stack**: Prisma ORM 7.10 (`prisma-client` generator, `@prisma/adapter-pg`), Better Auth (email/password),
  Server Actions, Zod DTOs; drop Zustand, TanStack Query, axios.
- **Project Structure**: `actions/`, `lib/dto/`, `lib/data/`, `lib/client/`, `prisma/schema.prisma`,
  `generated/` (ignored); drop `services/`, `stores/`, `server/`, `types/models.ts`.
- **TypeScript**: Zod schemas in `lib/dto` are the source of truth (`z.infer`); DTO variants per operation
  (`PostSummary`, `PostDetail`) shaped by `select`; no Prisma types outside `lib/data` (lint-enforced); `Page<T>`.
- **Authentication**: Better Auth with the official Prisma adapter and `nextCookies`; DB sessions; `role` as an
  additional field; `proxy.ts` optimistic only (`getSessionCookie`); `requireUser()` throws, `loadPage()` redirects;
  only `lib/data/auth.ts`, `actions/auth.ts`, `app/api/auth/[...all]`, and `proxy.ts` import `better-auth`.
- Replace **Services & API Calls**, **Server Layer**, **Zustand Stores**, and **Data Fetching Patterns** with:
  **Data Access Layer** (select exactly the DTO's columns; map to DTOs; throw typed errors; `server-only`),
  **Server Actions** (`'use server'` files in `actions/`; `parseInput` then DAL; `try/catch` →
  `toActionFailure`; `revalidatePath`/`refresh`; return `ActionResult<T>`), **Route Handlers and client facades**
  (only when a client must fetch; `toErrorResponse`; facade parses with the shared schema; current example
  `/posts/csr`), **Errors** (the four classes and how each caller translates them).
- **Hooks**: drop `useApiData`; keep the rule about not extracting component-married logic.
- **Forms**: schemas from `lib/dto`; the page passes an `onSubmit` that calls a Server Action and returns its
  `ActionResult`; the form maps failures with `applyActionErrors`.
- **Testing**: server tests use `// @vitest-environment node`, mock `next/headers` (cookie jar in
  `tests/helpers/cookies.ts`) and `next/cache`, create users with `createUser()` / `signInAs()` from
  `tests/helpers/server.ts`, and run against `next_template_test`.
- **Environment & Config**: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.
- **Working Principles**: replace the "no client-side token handling" bullet with "auth checks live in the DAL, never
  only in a page, action, or proxy".

- [ ] **Step 2: `docs/DECISIONS.md`**

Update the intro sentence to mention the 2026-10-05 data-layer refactor. Replace or add rows (same table columns;
"Nuxt template / Revcube" column may read `—` or the baseline's previous choice):

| Area | Next template | Why |
| --- | --- | --- |
| Global state | None (Zustand removed) | The viewer is read on the server; add a store when real cross-component client state appears. |
| Server state / fetching | Server Components read the DAL; client fetches only via facades | No HTTP round trip to our own handlers; TanStack Query had no remaining use. |
| Writes | Server Actions with plain Zod `safeParse` (`parseInput`), no next-safe-action | Fewer moving parts. Accepted: build-specific action IDs, POST-only, sequential, not callable by non-UI clients; auth in the DAL mitigates a forgotten check. |
| Data access | `lib/data` DAL, `server-only`, the only Prisma importer (lint-enforced) | One place for queries, mapping, and auth (Next's data-security guide). |
| DTO types | Zod schemas in `lib/dto`, types via `z.infer`; per-operation variants | Runtime validation and types from one source; client- and server-safe. Drift from the DB fails to compile where the DAL maps rows. |
| Errors | Typed DAL errors → `ActionResult` / HTTP 401-403-404-422 / redirect or `notFound()` | Each caller translates once; forms map `fieldErrors`. |
| Pagination | `Page<T> = { items, page, perPage, totalItems, totalPages }` | Replaces the Rails-style `Listing`. |
| ORM / DB | Prisma ORM 7.10.0 (stable) + PostgreSQL 16 | Prisma 8 was an RC with a pinned toolchain override; Better Auth's official adapter supports 5–7. |
| Prisma shape | `schema.prisma`, `prisma-client` generator to `generated/`, `@prisma/adapter-pg`, `DateTime` → `Date` | Prisma 7's default generator; client regenerated on `postinstall`. |
| Auth | Better Auth 1.7 email/password, official Prisma adapter, DB sessions, `nextCookies` | Auth.js is in maintenance under the Better Auth team; Better Auth is the recommended path. |
| Roles | `role` enum column (`user`/`admin`) as a Better Auth additional field; owner-or-admin on posts | Smallest real example of record-level rules. |
| HTTP client / response shape / JSON casing rows | Remove the axios and `ApiResponse` rows; keep camelCase JSON | — |

Also note that `(site)` pages are now request-time rendered because the layout reads the session.

- [ ] **Step 3: `README.md`**

Update setup steps for the new flow (copy `.env.example` → `.env`, fill `BETTER_AUTH_SECRET`; `docker compose up -d`;
`bun install` (generates the client); `bun run db:deploy`; `bun run db:seed`; `bun run dev`; log in as
`leanne@example.com` / `password123`, admin `admin@example.com` / `password123`; tests: copy `.env.test.example`,
`bun run db:test:prepare`, `bun run test`). Add a note for existing checkouts: the dev DB holds the old Prisma 8 schema,
so run `bun run db:reset` once (destroys dev data). Add two sections:

- **Design decisions**: the one-contract rule (three paths, one DAL function, one DTO), the DAL/DTO boundary,
  auth-in-the-DAL, Server Actions vs Route Handlers, typed errors per caller.
- **What I'd do at scale**: declarative authorization policies instead of inline checks; ZenStack or Postgres
  row-level security as a second enforcement layer; the existing lint rule extended to `better-auth` imports;
  cursor pagination (`CursorPage<T> = { items, nextCursor }`) for feeds; generated OpenAPI from the Zod schemas if
  external API consumers appear.

- [ ] **Step 4: Replay the README against a clean database** (closes the carried-over "never replayed" gap; uses a
      throwaway DB, never the dev DB)

```bash
createdb -h localhost -U postgres next_template_replay
REPLAY_URL="postgresql://postgres:postgres@localhost:5432/next_template_replay"
DATABASE_URL="$REPLAY_URL" bunx prisma migrate deploy
DATABASE_URL="$REPLAY_URL" bunx prisma db seed
DATABASE_URL="$REPLAY_URL" PORT=3100 BETTER_AUTH_URL=http://localhost:3100 bun run dev &   # wait for "Ready"
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3100/api/auth/sign-in/email \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:3100' \
  -d '{"email":"leanne@example.com","password":"password123"}'        # expect 200
curl -s 'http://localhost:3100/api/v1/posts?perPage=2' | head -c 300    # expect a Page JSON with 2 items
kill %1
dropdb -h localhost -U postgres next_template_replay
```

If the Postgres password differs from `postgres`, read user/password from `.env` without printing them. Record both
results in the report. If a README step is wrong, fix the README.

- [ ] **Step 5: Final verification and commit**

```bash
bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build
```

```bash
git add -A
git commit -m "docs: document the DAL, one-contract rule, and Better Auth setup"
```
