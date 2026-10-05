<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — Next Template

## The One-Contract Rule

Every data path ends at the same DAL function and returns the same DTO type under the same auth rules:
Server Component → `lib/data`; Server Action (`actions/`) → `lib/data`; client facade (`lib/client`) → Route
Handler (`app/api/v1`) → `lib/data`. DTOs are Zod schemas in `lib/dto` (`z.infer` gives the types). The DAL is the
only code that touches Prisma, and it enforces auth itself (`requireUser()` / `requireAdmin()` plus inline
record-level rules), so a caller that forgets a check cannot bypass it.

## Locating Code

- Tests under `tests/` mirror the source tree: `tests/components/Posts/PostForm.test.tsx` ↔
  `components/Posts/Form/`. When a test fails, read the test file first, then look for the source
  at the mirrored path before searching.
- Search with `rg`/`grep` scoped to this repo — never search outside the project directory.
  `node_modules/next/dist/docs/` and `node_modules/@prisma/` are the exceptions when you need the
  installed library's documentation.

## Build & Run Commands

| Command                                    | Purpose                                                      |
| ------------------------------------------ | ------------------------------------------------------------ |
| `bun run dev`                              | Start the Next dev server                                    |
| `bun run build`                            | Production build                                             |
| `bun run test`                             | Run all Vitest tests                                         |
| `bun run test tests/lib/dto/posts.test.ts` | Run a single test file                                       |
| `bun run test -t "formats validation"`     | Run tests matching a name pattern                            |
| `bun run lint`                             | ESLint                                                       |
| `bun run typecheck`                        | Generate the Prisma client and route types, then `tsc`       |
| `bun run format:check`                     | Prettier check                                               |
| `bun run db:generate`                      | Regenerate the Prisma client into `generated/`               |
| `bun run db:migrate`                       | Create + apply a migration to the dev DB, then regenerate    |
| `bun run db:deploy`                        | Apply pending migrations only (CI / production)              |
| `bun run db:seed`                          | Seed the dev DB (4 users, 16 posts; password `password123`)  |
| `bun run db:reset`                         | Drop, re-migrate, and re-seed the dev DB (destroys its data) |
| `bun run db:test:prepare`                  | Reset the test DB and apply migrations                       |

- **Package manager:** bun (pinned via `packageManager`). Do not use npm or yarn. Scripts run on
  Node, not the Bun runtime.
- `postinstall` runs `prisma generate` into the git-ignored `generated/` directory. Prisma 7 does
  not generate or seed automatically after `migrate dev` / `migrate reset`; the `db:*` scripts do
  it explicitly.

## Tech Stack

- **Framework:** Next.js 16 App Router / React 19 / TypeScript (strict mode)
- **UI primitives:** shadcn/ui on Radix, vendored as flat files in `components/SCN/`
- **Data layer:** server-only DAL in `lib/data`; Zod DTOs in `lib/dto`; Server Actions for writes
- **HTTP (client reads only):** `fetch` inside a typed facade in `lib/client`, parsed with the shared schema
- **Database:** Prisma ORM 7.10 (`prisma-client` generator, `@prisma/adapter-pg`) on PostgreSQL 16
- **Auth:** Better Auth (email + password, official Prisma adapter, `nextCookies`)
- **Forms:** React Hook Form + Zod 4
- **Styling:** SCSS — CSS Modules beside each component, tokens in `styles/`. Tailwind exists only
  inside `components/SCN` because shadcn needs it; nowhere else.
- **Testing:** Vitest + Testing Library (jsdom; server tests run in node against a real test DB)
- **Linting:** ESLint (`eslint-config-next` + `eslint-config-prettier`) + Prettier

## Project Structure

```
app/                     # App Router: route groups (site), (minimal); api/auth, api/v1 Route Handlers
  (site)/<route>/        # page.tsx (Server Component) + view.tsx ('use client') + styles.module.scss
actions/                 # 'use server' Server Actions (posts.ts, auth.ts)
components/              # React components (ComponentName/index.tsx + styles.module.scss)
components/SCN/          # shadcn/ui primitives (the only place Tailwind is allowed)
hooks/                   # Reusable React hooks (useXxx)
presenters/              # Override functions for views that need reshaped data
types/                   # Cross-cutting types (types/api.ts: ActionResult, ErrorBody, FieldErrors)
lib/                     # Pure helpers, constants, env, formErrors
lib/dto/                 # Zod schemas + inferred types (inputs and outputs); client- and server-safe
lib/data/                # Server-only DAL: db client, auth, errors, users, posts, page loader
lib/client/              # Client facades that fetch a Route Handler and parse with a lib/dto schema
prisma/                  # schema.prisma, migrations, seed
generated/               # Generated Prisma client (git-ignored; `postinstall` regenerates it)
styles/                  # Global SCSS (palette, variables, global)
proxy.ts                 # Optimistic auth redirects (Next 16's renamed middleware)
tests/                   # Vitest tests mirroring the source structure
docs/DECISIONS.md        # Framework and library choices, with reasons
```

## TypeScript

- **Strict mode** is enabled.
- Prefer `type` over `interface`. `interface` is acceptable when extension or declaration merging
  is needed.
- Use `| null` union types for nullable fields, matching the database.
- Avoid `any` when a proper type or type guard is practical.
- **Zod schemas in `lib/dto` are the source of truth for types** (`z.infer`). Inputs
  (`createPostInput`) and outputs (`postSummarySchema`, `postDetailSchema`) are both schemas.
  Output schemas use `z.coerce.date()` so a client that parses JSON gets `Date` back.
- DTO variants are per operation (`PostSummary` for lists, `PostDetail` for one record), shaped by
  the DAL's Prisma `select`; the DAL maps rows to DTOs, so drift from the database fails to compile
  there.
- **No Prisma types outside `lib/data`** (and `prisma/`). ESLint enforces this with
  `no-restricted-imports`.
- Lists are `Page<T> = { items, page, perPage, totalItems, totalPages }` (`lib/dto/common.ts`).
- Cross-cutting result types (`ActionResult<T>`, `ErrorBody`, `FieldErrors`) live in `types/api.ts`.
- Path alias: use `@/` to reference the project root.

## React Components

- Function components with **named exports**. Next route files (`page.tsx`, `layout.tsx`,
  `not-found.tsx`, `route.ts`) use the default exports Next requires.
- **Server Components by default.** Add `'use client'` only for state, effects, event handlers, or
  browser APIs. Interactive route UI lives in a sibling `view.tsx`; `page.tsx` stays a Server
  Component that owns `metadata` and awaits `params`/`searchParams` (they are Promises).
- Component folders: `components/<Area>/<Name>/index.tsx` with a co-located `styles.module.scss`.
- Match the style of the file or directory you are editing — do not restructure opportunistically.
- Do not cast with `as` inside JSX. Narrow or derive the value in the component body.

## Styling

- Outside `components/SCN`: semantic class names in a CSS Module, values from the tokens in
  `styles/variables.scss` (`var(--color-*)`). No Tailwind utilities, no `@apply`, no inline `style`
  unless the value is genuinely runtime-only.
- Inside `components/SCN`: Tailwind on the shadcn/Radix element only; wrapper elements the template
  adds use a CSS Module. Split long class lists into arrays passed to `cn`/`cva` so lines stay
  within 100 characters.
- Callers never pass `className`/`style` to reusable components. Add a named prop or variant to the
  owning component instead.
- Reusable form controls (`Input`, `Textarea`) own their visible label and error through `label`,
  `required`, and `error` props, and forward every other prop (including `ref` from
  `register()`) to the native control.

## Authentication

- **Better Auth**, email + password, with the official Prisma adapter and the `nextCookies` plugin
  (always the last plugin). Sessions are database rows; the session cookie is set by Better Auth.
  `role` (`user` / `admin`) is an additional user field, not settable from sign-up input.
- Only `lib/data/auth.ts`, `actions/auth.ts`, `app/api/auth/[...all]`, and `proxy.ts` import
  `better-auth`. Everything else asks the DAL: `getSessionUser()`, `requireUser()`,
  `requireAdmin()`, `getViewer()`.
- `requireUser()` always **throws** `UnauthorizedError`; it never redirects. Pages wrap their reads
  in `loadPage(load, path)` (`lib/data/page.ts`), which turns `UnauthorizedError` into a redirect to
  `/login?next=…` and `NotFoundError` into `notFound()`.
- `proxy.ts` is optimistic only: it checks cookie _presence_ (`getSessionCookie`) to redirect
  private pages to `/login?next=…` and signed-in users away from `/login` and `/signup`. The real
  check is always in the DAL.
- Client code never reads or sends a token; the cookie is httpOnly and travels on its own.

## Data Access Layer

- `lib/data/**` is the only code that imports `@/generated/prisma/*` or `@prisma/*`. Every file
  starts with `import 'server-only'`.
- Select exactly the columns a DTO needs (`satisfies Prisma.PostSelect`), map the row to the DTO,
  and return the DTO. Never return a Prisma row to a caller.
- Every function enforces auth itself: `requireUser()` / `requireAdmin()` plus inline record-level
  rules (e.g. a post may be changed by its author or an admin). For writes the order is signed in
  (401) → exists (404) → allowed (403).
- Failures are typed errors (see **Errors**), not return codes.
- Server Components call the DAL directly (wrapped in `loadPage` when they need the redirect /
  not-found behaviour). They never fetch the app's own Route Handlers. Opt into request-time
  rendering (`await connection()`) when a page reads data but not the session, so `next build`
  never queries the database.
- The seed (`prisma/seed.ts`) runs on plain Node outside Next, so it owns its own client rather than
  importing `lib/data`.

## Server Actions

- Writes go through `'use server'` files in `actions/`. Inputs are typed for callers but
  re-validated: anything can reach an action endpoint.
- Shape: `try { parseInput(schema, input) → DAL call → revalidatePath / refresh → { ok: true, data } }
catch (error) { return toActionFailure(error) }`. Return `ActionResult<T>`; never throw for
  expected failures.
- Auth actions (`signInAction`, `signUpAction`, `signOutAction`) call `auth.api.*` and `refresh()`.
- The calling view owns navigation and toasts; the form owns field errors.

## Route Handlers and client facades

- Use a Route Handler only when a client component must fetch (today: `GET /api/v1/posts`, the
  `/posts/csr` example). It stays thin: `parseInput` the query, call the DAL, return JSON or
  `toErrorResponse(error)`.
- The client calls it through a facade in `lib/client` (`fetchPosts`) that parses the response with
  the shared `lib/dto` schema and throws `RequestError` (message + status) on failure. Components do
  not call `fetch` directly.
- `/posts/csr` is the single live example of this path and has an end-to-end test.

## Errors

- The DAL throws `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, and `ValidationError`
  (all `DataError`s with a `code`). Anything else is a bug and propagates.
- Each caller translates once: Server Action → `toActionFailure` (`ActionResult` with `code`,
  `message`, optional `fieldErrors`; Next redirect/not-found errors are rethrown); Route Handler →
  `toErrorResponse` (401 / 403 / 404 / 422 with `ErrorBody`); page → `loadPage` (redirect to login or
  `notFound()`).
- Forms map failures with `applyActionErrors` (`lib/formErrors.ts`): field errors land on their
  fields, anything else on `root.server`.

## Hooks

- Located in `hooks/`. Named `useXxx` and exported as named functions.
- Return objects with state and stable callbacks.
- Only write a hook for independent logic or logic shared across components (e.g. `useScrollLock`). Never extract a hook for logic that is married to one component and gains
  nothing from the abstraction.

## Helpers & Presenters

- **Helpers** (`lib/`): exported named functions, no classes, no default exports. Pure
  formatting, parsing, and data utilities.
- **Presenters** (`presenters/`): plain functions, only for overrides. A presenter spreads the DTO
  and overrides or adds just the fields a view needs reshaped:
  `export const presentUser = (user) => ({ ...user, website: toAbsoluteUrl(user.website) })`.
  No classes, no presenter that only passes data through — if the DTO already fits the view, use it
  directly.
- Apply a presenter where the data is consumed (a view's `useMemo`). DTOs are plain
  objects, so they cross the Server → Client Component boundary safely; present on the client side
  of it.
- Reuse existing helpers and presenters before adding duplicate logic.

## Formatting (Prettier)

- Single quotes, no semicolons, trailing commas
- 2-space indentation (spaces, not tabs)
- 100-character print width

## Naming Conventions

| Element                      | Convention                 | Example                               |
| ---------------------------- | -------------------------- | ------------------------------------- |
| Variables / functions        | camelCase                  | `buildPostAttributes`, `presentUser`  |
| Components / classes / types | PascalCase                 | `PostForm`, `PostDetail`, `DataError` |
| Component directories        | PascalCase                 | `components/Posts/Form/`              |
| Route segments               | lowercase / kebab-case     | `app/(site)/ui-kit/`                  |
| Hooks                        | `useXxx`                   | `useScrollLock`                       |
| Presenters                   | `presentXxx`               | `presentUser`                         |
| Test files                   | `*.test.ts` / `*.test.tsx` | `posts.test.ts`                       |
| Server Actions               | `xxxAction` in `actions/`  | `createPostAction`                    |

## Testing

- Framework: Vitest. Tests live in `tests/` mirroring the source structure.
- Use `describe` / `it` blocks (not `test`).
- Import from vitest: `import { describe, expect, it } from 'vitest'`.
- Use `@/` path aliases for imports in test files.
- Server tests start with `// @vitest-environment node`, mock `next/headers` with the cookie jar in
  `tests/helpers/cookies.ts` and mock `next/cache`, create users with `createUser()` /
  `signInAs()` from `tests/helpers/server.ts`, and run against `next_template_test` only. Run
  `bun run db:test:prepare` after schema changes.
- `vitest.config.mts` inlines `better-auth` so its internal `next/headers` import goes through the
  mock.

## Test Pages

- Put manual UI test pages under `app/test/` (git-ignored).
- Prefer a narrow page that exercises existing app flows or Server Actions instead of duplicating
  component state locally.
- Name the route after the surface under test using kebab-case.
- Keep test pages internal-facing: simple controls, minimal copy, and enough state visibility to
  support manual QA without turning them into product UI.
- It should allow the tester to explore the component thoroughly.
- Reusable component examples belong in the `/ui-kit` catalog instead; keep it in sync when a
  reusable component changes.

## Forms

- React Hook Form + Zod via `zodResolver`. Schemas come from `lib/dto` and are the same ones the
  Server Actions validate with.
- The form component owns `useForm` and hands validated values to the page through `onSubmit`. The
  page passes an `onSubmit` that calls a Server Action and returns its `ActionResult`; the form maps
  failures with `applyActionErrors` (field errors onto fields, otherwise `message` as a form-level
  alert).
- Hydrate/build helpers (`hydrateXForm`, `buildXAttributes`) live in a `utils.ts` beside the form.
- Keep field markup explicit — no field-definition arrays, no generic FormField wrapper.

## Layouts

| Route group | Use case                                               |
| ----------- | ------------------------------------------------------ |
| `(site)`    | Main pages (NavBar, content container, footer)         |
| `(minimal)` | Auth pages (`/login`, `/signup`; no navigation chrome) |

- The root `app/layout.tsx` owns fonts, global styles, and `Providers` (tooltips, toaster).
- `(site)` pages render at request time: the layout reads the session (`getViewer()`) for the NavBar.

## Environment & Config

- Public config comes from `NEXT_PUBLIC_*` variables read once in `lib/env.ts` — do not hardcode
  URLs or app names.
- `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` live in `.env` (dev) and `.env.test`
  (tests). Both are untracked; update the `*.example` files when adding a variable.

## Verifying Changes

Do not run `bun run build` for every change — it is slow and unnecessary for most issues. Instead
run:

```bash
bun run typecheck   # type errors, broken imports, bad props
bun run lint        # syntax errors, unused vars, bad patterns
bun run test        # behavior
```

Run `bun run build` when you touch `next.config.ts`, `proxy.ts`, route segment config, dynamic
rendering, or the Server/Client Component boundary — those failures only surface at build time.

## Working Principles

- **Keep changes focused and minimal.** Do not refactor unrelated areas while solving a targeted
  task.
- **Match surrounding style.** Follow the import style, naming, and formatting of the file you are
  editing.
- **Prefer the existing primitives** in `components/SCN` (add more with `bunx shadcn@latest add`)
  before introducing new UI libraries.
- **Read installed sources instead of guessing.** Next.js docs are in `node_modules/next/dist/docs/`;
  shadcn components are vendored in `components/SCN`; Prisma guidance is in its synced skills.
- **Keep data access in the DAL (`lib/data`)**, not in components, pages, actions, or Route Handlers.
- **Auth checks live in the DAL**, never only in a page, action, or proxy.
- **Do not introduce patterns the codebase doesn't use.** Specifically: no class-based presenters,
  no hand-written types that duplicate a DTO schema, no `fetch` in components, no Server Components
  calling the app's own Route Handlers.
- **Temporary debug pages must live under `app/test/*`.** This path is git-ignored.
- **Commit messages** use conventional prefixes: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`,
  `test:`.
- **Avoid hacky ways of achieving tasks.** Do not hack your way into a solution. Think about
  whether it would pass a senior engineer reviewing your PR.
- **Record decisions.** Framework and library choices go in `docs/DECISIONS.md` with the reason.
