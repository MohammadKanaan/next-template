<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — Next Template

## Locating Code

- Tests under `tests/` mirror the source tree: `tests/components/Posts/PostForm.test.tsx` ↔
  `components/Posts/Form/`. When a test fails, read the test file first, then look for the source
  at the mirrored path before searching.
- Search with `rg`/`grep` scoped to this repo — never search outside the project directory.
  `node_modules/next/dist/docs/` and `node_modules/@prisma/` are the exceptions when you need the
  installed library's documentation.

## Build & Run Commands

| Command                                        | Purpose                                                        |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `bun run dev`                                  | Start the Next dev server                                      |
| `bun run build`                                | Production build                                               |
| `bun run test`                                 | Run all Vitest tests                                           |
| `bun run test tests/lib/apiCall.test.ts`       | Run a single test file                                         |
| `bun run test -t "formats validation"`         | Run tests matching a name pattern                              |
| `bun run lint`                                 | ESLint                                                         |
| `bun run typecheck`                            | Generate route types, then `tsc --noEmit`                      |
| `bun run format:check`                         | Prettier check                                                 |
| `bun run contract:emit`                        | Regenerate `prisma/contract.{json,d.ts}` after a schema change |
| `bun run db:migrate` / `db:deploy` / `db:seed` | Plan + apply migrations / apply only / seed the dev DB         |
| `bun run db:test:prepare`                      | Reset the test DB and apply migrations                         |

- **Package manager:** bun (pinned via `packageManager`). Do not use npm or yarn. Scripts run on
  Node, not the Bun runtime.
- There is no `postinstall` step: the emitted Prisma contract files are committed.

## Tech Stack

- **Framework:** Next.js 16 App Router / React 19 / TypeScript (strict mode)
- **UI primitives:** shadcn/ui on Radix, vendored as flat files in `components/SCN/`
- **State management:** Zustand (`stores/`)
- **Server state:** TanStack Query, wrapped by `hooks/useApiData`
- **HTTP client:** axios via the static `API` class (same-origin, httpOnly cookie auth)
- **Database:** Prisma ORM 8 (contract-based, pinned RC) on PostgreSQL 16
- **Forms:** React Hook Form + Zod 4
- **Styling:** SCSS — CSS Modules beside each component, tokens in `styles/`. Tailwind exists only
  inside `components/SCN` because shadcn needs it; nowhere else.
- **Testing:** Vitest + Testing Library (jsdom; server tests run in node against a real test DB)
- **Linting:** ESLint (`eslint-config-next` + `eslint-config-prettier`) + Prettier

## Project Structure

```
app/                     # App Router: route groups (site), (minimal); api/v1 Route Handlers
  (site)/<route>/        # page.tsx (Server Component) + view.tsx ('use client') + styles.module.scss
components/              # React components (ComponentName/index.tsx + styles.module.scss)
components/SCN/          # shadcn/ui primitives (the only place Tailwind is allowed)
hooks/                   # Reusable React hooks (useXxx)
stores/                  # Zustand stores (useXxxStore)
services/                # API service classes (class extends API) + their DTO types
presenters/              # Override functions for views that need reshaped data
types/                   # Shared types; types/models.ts re-exports the generated Prisma models
lib/                     # Pure helpers, constants, env, validation schemas, apiCall helpers
server/                  # Server-only code: db client, auth, http helpers, repositories, serializers
prisma/                  # contract.prisma (schema), emitted contract, migrations, seed
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
- **Types are the source of truth, and they are generated.** `prisma/contract.prisma` →
  `bun run contract:emit` → `prisma/contract.d.ts` → `types/models.ts` (`UserModel`, `PostModel`).
  Every DTO is derived from those models with `Pick`/`Omit`/intersections — never hand-write a
  response type that repeats model columns. API JSON uses the model's camelCase keys.
- DTO types live next to the service that returns them (`UserResponse` in
  `services/UsersService.ts`). Cross-cutting API types (`ApiResponse`, `Listing`, `Permissions`)
  live in `types/api.ts`.
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
- Select Zustand state one slice at a time (`useUserStore((s) => s.user)`), never with an
  object-literal selector.

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

- **Cookie-based auth.** `POST /api/v1/auth/session` sets an httpOnly `Uauth` cookie; the token is
  stored hashed in the `sessions` table. Client code never reads or sends the token — axios calls
  are same-origin, so the cookie travels automatically.
- `proxy.ts` only checks cookie _presence_ to redirect private pages to `/login?next=…`. Route
  Handlers enforce the session (`server/auth.ts`); a stale cookie is cleared on the next
  `/api/v1/me` call.
- The email-only login is a dev placeholder. Do not add token refresh logic or client-side token
  handling; replace the session flow wholesale when real auth lands.

## Services & API Calls

- All services are in `services/` and extend the base `API` class from `services/api.ts`.
- Services use **static methods** exclusively — no instantiation.
- HTTP calls use `this.get<T>()`, `this.post<T>()`, `this.put<T>()`, `this.patch<T>()`,
  `this.delete<T>()`.
- They return `Promise<ApiResponse<T>>` where
  `ApiResponse<T> = { success, status, message, data: T | null, errors? }`. They never throw.
- `ApiError` and `ApiSuccess` in `services/` handle response wrapping; `errors` carries per-field
  validation messages from 422 responses.
- `sFetch` / `sData` / `mFetch` / `mData` (`lib/apiCall.ts`) standardize loading, toasts, and
  throwing around service calls. Pass `{ toast: false, throwOnError: false }` when the caller shows
  the error inline.
- File naming: PascalCase (`PostsService.ts`, `AuthService.ts`).
- Do not put HTTP calls directly in components or pages — use services.

## Server Layer

- Route Handlers in `app/api/v1/**` stay thin: parse and validate (Zod from `lib/validation`), call
  a repository, return a serializer's DTO via `ok()` / `fail()` / `invalid()` from `server/http.ts`.
- Repositories (`server/repositories/`) are the only code that queries Prisma
  (`db.orm.public.<Model>…`).
- Serializers (`server/serializers/`) turn rows into the service DTOs: pick public columns, convert
  Postgres timestamp text to ISO strings, add computed fields such as `permissions`.
- Server Components read data through repositories + serializers directly. They never fetch the
  app's own Route Handlers.
- Every file under `server/` starts with `import 'server-only'` unless it is type-only.

## Zustand Stores

- One store per concern in `stores/`, created with `create<State>()((set, get) => ({ … }))`.
- Naming convention: `useXxxStore` (e.g. `useUserStore`).
- State and actions live in one typed object; actions call services via `sFetch` and return the
  `ApiResponse` so callers can react to failures.
- Stores mutate state. Components decide navigation.

## Hooks

- Located in `hooks/`. Named `useXxx` and exported as named functions.
- Return objects with state and stable callbacks.
- Only write a hook for independent logic or logic shared across components (e.g. `useApiData`,
  `useScrollLock`). Never extract a hook for logic that is married to one component and gains
  nothing from the abstraction.

## Helpers & Presenters

- **Helpers** (`lib/`): exported named functions, no classes, no default exports. Pure
  formatting, parsing, and data utilities.
- **Presenters** (`presenters/`): plain functions, only for overrides. A presenter spreads the DTO
  and overrides or adds just the fields a view needs reshaped:
  `export const presentUser = (user) => ({ ...user, website: toAbsoluteUrl(user.website) })`.
  No classes, no presenter that only passes data through — if the DTO already fits the view, use it
  directly.
- Apply a presenter where the data is consumed (a view's `useMemo`, a store action). DTOs are plain
  objects, so they cross the Server → Client Component boundary safely; present on the client side
  of it.
- Reuse existing helpers and presenters before adding duplicate logic.

## Formatting (Prettier)

- Single quotes, no semicolons, trailing commas
- 2-space indentation (spaces, not tabs)
- 100-character print width

## Naming Conventions

| Element                      | Convention                 | Example                                    |
| ---------------------------- | -------------------------- | ------------------------------------------ |
| Variables / functions        | camelCase                  | `buildPostAttributes`, `presentUser`       |
| Components / classes / types | PascalCase                 | `PostsService`, `PostForm`, `UserResponse` |
| Component directories        | PascalCase                 | `components/Posts/Form/`                   |
| Route segments               | lowercase / kebab-case     | `app/(site)/ui-kit/`                       |
| Stores                       | `useXxxStore`              | `useUserStore`                             |
| Hooks                        | `useXxx`                   | `useApiData`                               |
| Presenters                   | `presentXxx`               | `presentUser`                              |
| Test files                   | `*.test.ts` / `*.test.tsx` | `apiCall.test.ts`                          |
| Service files                | PascalCase                 | `AuthService.ts`                           |

## Testing

- Framework: Vitest. Tests live in `tests/` mirroring the source structure.
- Use `describe` / `it` blocks (not `test`).
- Import from vitest: `import { describe, expect, it } from 'vitest'`.
- Use `@/` path aliases for imports in test files.
- For testing protected class methods, create subclasses that expose them as public (see
  `tests/services/api.test.ts`).
- Server tests start with `// @vitest-environment node`, mock `next/headers` cookies, and run
  against `next_template_test` only. Run `bun run db:test:prepare` after schema changes.

## Test Pages

- Put manual UI test pages under `app/test/` (git-ignored).
- Prefer a narrow page that exercises existing app flows or store APIs instead of duplicating
  component state locally.
- Name the route after the surface under test using kebab-case.
- Keep test pages internal-facing: simple controls, minimal copy, and enough state visibility to
  support manual QA without turning them into product UI.
- It should allow the tester to explore the component thoroughly.
- Reusable component examples belong in the `/ui-kit` catalog instead; keep it in sync when a
  reusable component changes.

## Forms

- React Hook Form + Zod via `zodResolver`. Schemas live in `lib/validation/` and are shared with
  the Route Handlers that validate the same payload.
- The form component owns `useForm` and its schema and hands validated values to the page through
  `onSubmit`. The page owns the request and returns the `ApiResponse`; the form maps `errors` onto
  fields (or shows `message` as a form-level alert).
- Hydrate/build helpers (`hydrateXForm`, `buildXAttributes`) live in a `utils.ts` beside the form.
- Keep field markup explicit — no field-definition arrays, no generic FormField wrapper.

## Data Fetching Patterns

- Client views fetch through `useApiData(queryKeys.x(…), (signal) => XService.method(…, signal))`.
  Query keys live in `lib/queryKeys.ts`; after a mutation, invalidate or set the affected keys.
- Server Components may read data during render via repositories (see Server Layer). Opt into
  request-time rendering (`await connection()`) so `next build` never queries the database.
- Do not call `fetch` or axios directly from components — go through services.
- Toasts (`sonner`) come from `sFetch` by default. Disable them when the view renders the error
  inline, so a failure is reported once.

## Layouts

| Route group | Use case                                           |
| ----------- | -------------------------------------------------- |
| `(site)`    | Main pages (NavBar, content container, footer)     |
| `(minimal)` | Auth pages such as `/login` (no navigation chrome) |

- The root `app/layout.tsx` owns fonts, global styles, and `Providers` (TanStack Query, tooltips,
  toaster, user bootstrap).

## Environment & Config

- Public config comes from `NEXT_PUBLIC_*` variables read once in `lib/env.ts` — do not hardcode
  URLs or app names.
- `DATABASE_URL` lives in `.env` (dev) and `.env.test` (tests). Both are untracked; update the
  `*.example` files when adding a variable.

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
  shadcn components are vendored in `components/SCN`; Prisma 8 guidance is in its synced skill.
- **Keep data access in services (client) and repositories (server)**, not in components or pages.
- **Do not introduce patterns the codebase doesn't use.** Specifically: no class-based presenters,
  no hand-written DTOs that duplicate Prisma models, no `fetch` in components, no client-side token
  handling, no Server Components calling the app's own Route Handlers.
- **Temporary debug pages must live under `app/test/*`.** This path is git-ignored.
- **Commit messages** use conventional prefixes: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`,
  `test:`.
- **Avoid hacky ways of achieving tasks.** Do not hack your way into a solution. Think about
  whether it would pass a senior engineer reviewing your PR.
- **Record decisions.** Framework and library choices go in `docs/DECISIONS.md` with the reason.
