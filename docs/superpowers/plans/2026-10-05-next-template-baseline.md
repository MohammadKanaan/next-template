# Next Template Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the fresh `create-next-app` scaffold into a reusable baseline that carries over the good patterns of the Nuxt template (`/Users/abdoachkar/programming/nuxt-3-template`) and the newer Revcube API service / presenter / form structure (`/Users/abdoachkar/programming/revcube-nuxt`), backed by Prisma + PostgreSQL.

**Architecture:** Next.js 16 App Router. Browser code talks to the app's own Route Handlers (`app/api/v1/**`) through a Revcube-style static `API` service layer (axios) that always resolves to `ApiResponse<T>`; `$sFetch`-style helpers own loading/toast/throw behavior; presenters are view models built at the point of consumption. Route Handlers are thin: validate with Zod, call Prisma repositories, serialize Prisma rows into the same `*Response` contract types the services declare. Server Components may call repositories + serializers directly (never their own HTTP API). Styling is SCSS (CSS Modules) everywhere except `components/SCN`, where shadcn/ui uses Tailwind v4.

**Tech Stack:** Next.js 16.3.8, React 19.2, TypeScript 5.9, Bun (package manager) on Node 24, SCSS (`sass`) CSS Modules, shadcn/ui (Radix) + Tailwind CSS 4 (SCN only), lucide-react, sonner, axios, TanStack Query 5, Zustand 5, React Hook Form 7 + `@hookform/resolvers` + Zod 4, Prisma ORM 8 (pinned RC) + PostgreSQL 16, Vitest + Testing Library + jsdom.

**Spec:** No separate spec document. The binding requirements are the user's requests in chat on 2026-10-05: "a nextjs clone [of nuxt-3-template], choose latest; choose sensible defaults / alternatives for each vue specific; shadcn and some others are already available for react; record your decisions; use scss; use Prisma; this will be a baseline" and "start with a fresh nextjs setup, then port the good patterns and setups in" plus the original request to use "the API Service layer and presenters handling structure of revcube (the newer ones … avoid [the legacy system]) … Same with form handling." The Decisions table in Task 1 is the recorded interpretation.

## Reference sources (read-only)

- **Nuxt template:** `/Users/abdoachkar/programming/nuxt-3-template` — design tokens (`assets/*.scss`), constants (`lib/constants-*.ts`), component APIs (`components/SCN/**`, `components/**`), `AGENTS.md`, `.prettierrc`, `eslint.config.mjs`.
- **Revcube (newer layer only):** `/Users/abdoachkar/programming/revcube-nuxt` — `services/api.ts`, `services/ApiError.ts`, `services/ApiSuccess.ts`, `services/*Service.ts` (PascalCase files), `lib/apiCall.ts`, `lib/errorMessage.ts`, `composables/useApiData.ts`, `presenters/User/UserPresenter.ts`, `stores/user.ts`, `components/DealOverview/Overview/script.ts` + `coreDetailsUtils.ts` (newest form flow), `lib/validation/*.ts`.
- **Legacy Revcube layer — DO NOT use or copy:** `services/apiUtils.ts` and every lowercase `services/*.ts` (`deals.ts`, `accounts.ts`, `ai.ts`, …), `presentResponse`, `toPlainDeep`, `composables/useForm.ts`, `lib/form.ts`.
- Never copy Revcube domain names, routes, colors, or data contracts. Copy structure only.

## Global Constraints

- Work only in `/Users/abdoachkar/programming/next-template` on branch `feat/baseline`. Never touch the two reference repositories.
- Package manager: `bun` (`bun add`, `bun run <script>`, `bunx`). Scripts run on Node (Next, Vitest, Prisma CLIs), not the Bun runtime.
- Next.js APIs: this Next version differs from training data. Before writing routing, proxy, route-handler, caching, font, or config code, read the matching guide under `node_modules/next/dist/docs/` (see `AGENTS.md`). Notable: `middleware.ts` is `proxy.ts`; route `params`/`searchParams` are Promises.
- Tailwind utility classes, Tailwind directives and `@theme`/`@layer` live **only** under `components/SCN`. Everything else uses semantic class names in a co-located `styles.module.scss`. No `@apply`, no Tailwind classes, no inline `style` outside SCN.
- Callers outside `components/SCN` never pass `className` or `style` to a reusable component. If a visual option is missing, add a named prop/variant to the owning component.
- Prettier: `semi: false`, `singleQuote: true`, `trailingComma: 'all'`, `printWidth: 100`, `arrowParens: 'always'`, `endOfLine: 'lf'`, `tabWidth: 2`. Every TS/TSX line ≤ 100 chars; split long Tailwind class lists into arrays of short strings passed to `cn(...)`/`cva(...)`.
- Component folder convention outside SCN: `components/<Area>/<Name>/index.tsx` (named export) + `styles.module.scss`. Route folders: `page.tsx` (Server Component, exports `metadata`) + optional `view.tsx` (`'use client'`) + optional `styles.module.scss`.
- Imports use the `@/` alias. Named exports everywhere except Next route files (`page.tsx`, `layout.tsx`, `not-found.tsx`, `route.ts` follow Next's required exports) and service classes (default export, Revcube style).
- API JSON keys are `snake_case` (Rails/Revcube convention); Prisma model fields are `camelCase` with `@map` to `snake_case` columns.
- Presenters are constructed where data is consumed (store setter, client view, server page). Services never construct presenters. Presenter instances never cross the Server→Client Component boundary — pass `*Response` objects and construct inside the client component.
- One commit per task; commit subject starts with `Task <N>: `. End every commit message with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- After each task: `bun run lint`, `bun run typecheck`, `bun run test` must pass (once those scripts exist, i.e. from Task 1 onward). `bun run build` must pass at the end of Tasks 2, 5, 9, 10, 11.
- Never commit secrets: `.env`, `.env.test` stay untracked; commit only `*.example` files.
- Local PostgreSQL 16 is running on `localhost:5432`, user `abdoachkar`, no password. Dev DB `next_template_dev`, test DB `next_template_test`.

---

## Phase 1 — Foundation and UI (Tasks 1–5)

### Task 1: Tooling, conventions, and recorded decisions

**Files:**
- Create: `.prettierrc`, `.prettierignore`, `vitest.config.mts`, `tests/setup.ts`, `docs/DECISIONS.md`, `lib/constants-routes.ts`, `lib/constants-auth.ts`, `lib/constants-breakpoints.ts`, `lib/env.ts`, `tests/lib/constants-routes.test.ts`
- Modify: `package.json` (scripts, devDependencies), `eslint.config.mjs`, `.gitignore`, `AGENTS.md`, `CLAUDE.md` (leave as `@AGENTS.md`)

**Interfaces:**
- Produces: `ROUTE_*` constants, `ROUTE_POST_DETAILS(userId, postId)`, `ROUTE_POST_EDIT(userId, postId)`, `isPublicRoute(path)`, `isPrivateRoute(path)`, `safeRedirectPath(value, fallback?)`; `AUTH_COOKIE_NAME`, `AUTH_COOKIE_MAX_AGE_SECONDS`; `BREAKPOINTS`; `env.apiBaseUrl`, `env.appName`.

- [ ] **Step 1: Install dev tooling**

```bash
bun add -d prettier eslint-config-prettier vitest @vitejs/plugin-react vite-tsconfig-paths jsdom \
  @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

- [ ] **Step 2: Prettier.** `.prettierrc` = exactly the Global Constraints values (copy `/Users/abdoachkar/programming/nuxt-3-template/.prettierrc`). `.prettierignore`:

```
node_modules
.next
out
build
coverage
bun.lock
next-env.d.ts
generated
```

- [ ] **Step 3: ESLint.** Keep the generated `nextVitals` + `nextTs` config, append `eslint-config-prettier` (flat export `eslint-config-prettier/flat`), then this block (ported from the Nuxt template's non-formatting rules):

```js
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
  files: ['components/SCN/**/*.{ts,tsx}'],
  rules: {
    'max-len': ['error', { code: 100, tabWidth: 2, ignoreUrls: true, ignoreRegExpLiterals: true }],
  },
},
```

Also add `generated/**` and `coverage/**` to `globalIgnores`.

- [ ] **Step 4: Scripts** in `package.json` (Prisma scripts are added in Task 6):

```json
"dev": "next dev",
"build": "next build",
"start": "next start",
"lint": "eslint .",
"format": "prettier --write .",
"format:check": "prettier --check .",
"typecheck": "next typegen && tsc --noEmit",
"test": "vitest run",
"test:watch": "vitest"
```

Verify `next typegen` exists in this Next version (`bunx next --help`); if it does not, use `"tsc --noEmit"` and declare it.

- [ ] **Step 5: Vitest.** `vitest.config.mts`:

```ts
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig, loadEnv } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    env: loadEnv(mode, process.cwd(), ''),
    fileParallelism: false,
  },
}))
```

`tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 6: `.gitignore`.** Keep the generated content; replace the `.env*` line with:

```
.env*
!.env.example
!.env.test.example
```

and append:

```
# local agent workspaces and generated clients
.superpowers/
/generated/
```

- [ ] **Step 7: Constants.** `lib/constants-breakpoints.ts` — copy verbatim from the Nuxt template (`BREAKPOINTS` + `BreakpointName`). `lib/constants-auth.ts`:

```ts
export const AUTH_COOKIE_NAME = 'Uauth'
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
```

`lib/env.ts`:

```ts
export const env = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'Next Template',
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1',
} as const
```

- [ ] **Step 8: Write the failing routes test** `tests/lib/constants-routes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  ROUTE_POST_DETAILS,
  ROUTE_POST_EDIT,
  isPrivateRoute,
  isPublicRoute,
  safeRedirectPath,
} from '@/lib/constants-routes'

describe('route helpers', () => {
  it('builds encoded post routes', () => {
    expect(ROUTE_POST_DETAILS(3, 'a b')).toBe('/posts/3/a%20b')
    expect(ROUTE_POST_EDIT(3, 7)).toBe('/posts/3/7/edit')
  })

  it('treats listing and detail pages as public', () => {
    for (const path of ['/', '/login', '/posts', '/posts/ssr', '/posts/1/2', '/ui-kit']) {
      expect(isPublicRoute(path)).toBe(true)
    }
  })

  it('treats authoring pages and unknown pages as private', () => {
    for (const path of ['/posts/new', '/posts/1/2/edit', '/private', '/anything']) {
      expect(isPrivateRoute(path)).toBe(true)
    }
  })

  it('only accepts same-origin relative redirect targets', () => {
    expect(safeRedirectPath('/posts/new')).toBe('/posts/new')
    expect(safeRedirectPath('//evil.example')).toBe('/private')
    expect(safeRedirectPath('https://evil.example')).toBe('/private')
    expect(safeRedirectPath(undefined, '/')).toBe('/')
  })
})
```

Run `bun run test` → FAIL (module not found).

- [ ] **Step 9: Implement `lib/constants-routes.ts`:**

```ts
type RouteParameter = string | number

const encode = (value: RouteParameter) => encodeURIComponent(String(value))

export const ROUTE_HOME = '/'
export const ROUTE_LOGIN = '/login'
export const ROUTE_PRIVATE = '/private'
export const ROUTE_POSTS = '/posts'
export const ROUTE_POSTS_SSR = `${ROUTE_POSTS}/ssr`
export const ROUTE_POSTS_CSR = `${ROUTE_POSTS}/csr`
export const ROUTE_POST_NEW = `${ROUTE_POSTS}/new`
export const ROUTE_UI_KIT = '/ui-kit'

export const ROUTE_POST_DETAILS = (userId: RouteParameter, postId: RouteParameter) =>
  `${ROUTE_POSTS}/${encode(userId)}/${encode(postId)}`

export const ROUTE_POST_EDIT = (userId: RouteParameter, postId: RouteParameter) =>
  `${ROUTE_POST_DETAILS(userId, postId)}/edit`

export const PUBLIC_ROUTES = [ROUTE_HOME, ROUTE_LOGIN, ROUTE_POSTS, ROUTE_UI_KIT] as const

const AUTHORING_ROUTE_PATTERN = /^\/posts\/(?:new|[^/]+\/[^/]+\/edit)\/?$/

export const isPublicRoute = (path: string): boolean =>
  !AUTHORING_ROUTE_PATTERN.test(path) &&
  PUBLIC_ROUTES.some(
    (route) => path === route || (route !== ROUTE_HOME && path.startsWith(`${route}/`)),
  )

export const isPrivateRoute = (path: string): boolean => !isPublicRoute(path)

export function safeRedirectPath(value: string | null | undefined, fallback = ROUTE_PRIVATE) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : fallback
}
```

Run `bun run test` → PASS.

- [ ] **Step 10: `docs/DECISIONS.md`.** Create with exactly this content (later tasks append rows only when they make a new decision, and must update a row if a fallback was taken):

```markdown
# Decisions

Baseline ported from `nuxt-3-template` (UI conventions, tokens) and Revcube's newer API layer
(services, presenters, forms). Each row: what the Nuxt/Vue setup used → what this project uses → why.

| Area | Nuxt template / Revcube | Next template | Why |
| --- | --- | --- | --- |
| Framework | Nuxt 4 | Next.js 16 App Router | Latest stable; App Router is the current default. |
| Package manager | yarn 1 / bun | bun | Fast installs; Revcube already uses bun. Scripts still run on Node. |
| Bundler | Vite | Turbopack (Next default) | Default in Next 16; no custom loaders needed. |
| Pages | `pages/**` + `script.ts` + `styles.scss` | `app/**/page.tsx` + optional `view.tsx` (client) + `styles.module.scss` | Server page owns metadata/data; client view owns interactivity. |
| Layouts | `layouts/Default`, `layouts/minimal` | Route groups `app/(site)` and `app/(minimal)` | Route-group layouts are the App Router equivalent. |
| Catch-all 404 | `pages/[...slug].vue` | `app/not-found.tsx` | Built-in not-found convention. |
| Route paths | `/Posts` | `/posts` | Lowercase URLs are conventional. |
| Scoped styles | `<style scoped lang="scss">` | CSS Modules `styles.module.scss` | Native Next support, component-scoped by default. |
| Design tokens | `assets/palette.scss` → `variables.scss` → CSS vars | Same files under `styles/`, imported once in the root layout | Keeps the single token source. |
| SCSS breakpoints | Vite `additionalData` | `sassOptions.additionalData` in `next.config.ts` | Same `$breakpoint-*` variables in every module. |
| Font | Google Fonts `<link>` | `next/font/google` Inter (`--font-inter`) | Self-hosted, no layout shift. |
| UI primitives | shadcn-vue + reka-ui | shadcn/ui (new-york) + Radix UI, in `components/SCN` | Direct React counterpart. Flat shadcn file layout kept so `shadcn add` keeps working. |
| Tailwind | v3 + `tailwind.config.ts` | v4 CSS-first, `@source` limited to `components/SCN` | v4 is what shadcn targets; scoping enforces the "Tailwind only in SCN" rule. |
| Animations | tailwindcss-animate | tw-animate-css | shadcn's v4 replacement. |
| Icons | lucide-vue-next | lucide-react | Same icon family. |
| Toasts | vue-sonner + `$toast` | sonner `toast` | Same library family. |
| Global state | Pinia | Zustand | Minimal store API, no provider. |
| Server state / fetching | `useAsyncData` / Revcube `useApiData` | TanStack Query via `hooks/useApiData` | Caching, dedupe, invalidation. Queries default to `retry: false` like `useAsyncData`. |
| HTTP client | Revcube static `API` (axios) | Same structure, axios, `AbortSignal` instead of `CancelToken` | Keeps Revcube shape; `CancelToken` is deprecated. |
| Response shape | `ApiResponse<T>` without field errors | `ApiResponse<T>` + optional `errors: Record<string, string[]>` | Lets forms map server validation errors to fields. |
| Presenters | Revcube `constructor(data: XPresenter)` | `constructor(data: XResponse)` | Same class shape, typed input, no `as` casts. |
| Backend | jsonplaceholder / Rails | Route Handlers `app/api/v1/**` + Prisma | The baseline owns its API. |
| ORM / DB | — | Prisma ORM 8 (pinned RC) + PostgreSQL 16 | "Use Prisma, choose latest"; Prisma 8 is the current line for new apps. |
| Server data in RSC | `useAsyncData` on server | Repositories + serializers called directly | Next discourages Server Components fetching their own Route Handlers. |
| Auth | Token cookie read by JS, global middleware | httpOnly session cookie set by Route Handlers, `proxy.ts` guard | JS never sees the token. Dev-only email login; replace before production. |
| Forms | VeeValidate + `@vee-validate/zod` + Zod | React Hook Form + `@hookform/resolvers` + Zod 4 | React counterpart; same schema-first flow. |
| Field markup | shadcn-vue `FormField`/`FormItem` | Controls own `label`, `required`, `error` props | Template rule: no generic FormField wrapper. |
| Runtime config | `runtimeConfig.public` | `NEXT_PUBLIC_*` via `lib/env.ts` | Next's env convention. |
| Auto-imports | Nuxt auto-imports | Explicit imports, `@/` alias | React/Next has no auto-import. |
| Tests | vitest stub | Vitest + Testing Library + jsdom; server tests on a real test DB | Fast unit tests, real integration for handlers. |
| Docker | Node app containers | `docker-compose.yml` with PostgreSQL only | Deployment image deferred to a later iteration. |
| Deferred | vuedraggable, FileUpload, Tabs, Modal, TableSimple, AppAvatar, date pickers, dark-mode toggle | Not ported yet | Ported later, on demand, using the same conventions. |
```

- [ ] **Step 11: `AGENTS.md`.** Keep the `<!-- BEGIN:nextjs-agent-rules -->…<!-- END:nextjs-agent-rules -->` block exactly as generated at the top. Below it, append the Nuxt template's `AGENTS.md` guidance (`/Users/abdoachkar/programming/nuxt-3-template/AGENTS.md`) translated to React/Next. Keep every rule; apply these translations and nothing else:
  - Title `# Next Template Guidance`.
  - "Revcube" stays the structure reference; add that its **legacy** service layer (`services/apiUtils.ts`, lowercase service files, `presentResponse`) must not be used.
  - `components/SCN` rules stay; "scoped or global SCSS" → "CSS Modules (`styles.module.scss`) or `styles/global.scss`".
  - `:style` / inline style attributes → `style` prop / inline styles.
  - `class` passed by parents → `className` passed by callers.
  - `inheritAttrs: false` + `v-bind="$attrs"` → "destructure the props the wrapper owns and spread the remaining props onto the actual native or Radix control".
  - "do not redeclare the child's full prop/emits API or rebuild it with `reactiveOmit`, `useForwardProps`…" → "type wrapper props as `ComponentProps<typeof Control> & OwnedProps`; do not re-declare the control's props one by one".
  - `modelValue` → `value`/`onChange` (or `checked`/`onCheckedChange` for Radix toggles).
  - "Use semantic component classes with native scoped or global SCSS" → same with CSS Modules.
  - Add a `## Data Layer` section with these bullets: services extend `API` and return `ApiResponse<T>`; `*Response`/`*Attributes`/`*ListParams` types live next to their service; presenters live in `presenters/<Domain>/<Name>Presenter.ts`, are built at consumption and never cross the Server→Client boundary; Route Handlers stay thin (validate → repository → serializer); Server Components use repositories directly; forms own their `useForm` + Zod schema and hand validated values to the page, which owns the request.
  - Add a `## Decisions` bullet: record framework/library choices in `docs/DECISIONS.md`.

- [ ] **Step 12: Verify and commit.** `bun run lint && bun run typecheck && bun run test && bun run format:check` (run `bun run format` first). Commit: `Task 1: tooling, conventions, and decisions record`.

---

### Task 2: Design tokens, global styles, root layout

**Files:**
- Create: `styles/palette.scss`, `styles/variables.scss`, `styles/global.scss`, `app/(site)/layout.tsx`, `app/(site)/styles.module.scss`, `app/(site)/page.tsx`, `app/(site)/home.module.scss`, `app/(minimal)/layout.tsx`, `app/(minimal)/styles.module.scss`
- Modify: `app/layout.tsx`, `next.config.ts`
- Delete: `app/page.tsx`, `app/globals.css`, `app/page.module.css` (if present), `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`

**Interfaces:**
- Produces: CSS custom properties from the Nuxt template (`--color-*`, `--color-*-hsl`, `--primary`, `--background`, `--radius`, `--shadow-lg`, `--font-family-primary`, …); SCSS `$breakpoint-<name>` variables in every module; layouts `(site)` (header/main/footer slots filled in Task 4) and `(minimal)`.

- [ ] **Step 1: Tokens.** Copy `assets/palette.scss`, `assets/variables.scss`, `assets/global.scss` from the Nuxt template into `styles/` unchanged, then make only these edits: in `styles/global.scss` fix the `@use` paths if needed; in `styles/variables.scss` change the `font-family-primary` value to `"var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"`; delete any rule that targets Nuxt-only selectors (e.g. `#__nuxt`), replacing it with the `body` equivalent. Keep `.ui-focus-ring`, `.ui-press`, `.ui-press-strong` helpers and `.is-scroll-locked`.

- [ ] **Step 2: Breakpoints in Sass.** `next.config.ts`:

```ts
import type { NextConfig } from 'next'
import { BREAKPOINTS } from './lib/constants-breakpoints'

const scssBreakpoints = Object.entries(BREAKPOINTS)
  .map(([name, value]) => `$breakpoint-${name}: ${value};`)
  .join('\n')

const nextConfig: NextConfig = {
  sassOptions: {
    additionalData: scssBreakpoints,
  },
}

export default nextConfig
```

Install `bun add -d sass`. Read `node_modules/next/dist/docs` for `sassOptions` under Turbopack. If `additionalData` is not honored by Turbopack, instead create `styles/_breakpoints.scss` with the same variables and `@use '../../styles/breakpoints' as *;` (relative) where needed; record the fallback in `docs/DECISIONS.md` (update the "SCSS breakpoints" row) and declare it.

- [ ] **Step 3: Root layout** `app/layout.tsx` — Server Component; `Inter` from `next/font/google` with `variable: '--font-inter'`, `subsets: ['latin']`; `metadata` with `title: { default: env.appName, template: \`%s | ${env.appName}\` }`; imports `@/styles/global.scss` (the SCN Tailwind stylesheet import is added in Task 3); `<html lang="en" className={inter.variable}>`; `<body>{children}</body>`. (`Providers` is added in Task 4.)

- [ ] **Step 4: Route-group layouts.** Port `layouts/Default` and `layouts/minimal` structure from the Nuxt template: `(site)/layout.tsx` renders `<main className={styles.main}><div className={styles.container}>{children}</div></main>` using the Default layout's SCSS (`container-1` → `.container`); `(minimal)/layout.tsx` renders `<div className={styles.minimalContent}>{children}</div>` with the minimal layout's SCSS.

- [ ] **Step 5: Home page** `app/(site)/page.tsx`: port `pages/index` — a `<section>` with `<h1>Welcome</h1>` and a paragraph "A minimal Next.js starter with shadcn/ui, Prisma, and a typed API layer." (Spinner button is added in Task 3 once SCN exists.) Styles from the Nuxt `pages/index/styles.scss`.

- [ ] **Step 6: Verify.** `bun run build` passes; `bun run dev`, `curl -s localhost:3000 | grep Welcome` succeeds; stop the server. Run lint/typecheck/test/format. Commit: `Task 2: design tokens, global styles, and layouts`.

---

### Task 3: shadcn/ui primitives in `components/SCN`

**Files:**
- Create: `components.json`, `components/SCN/tailwind/styles.css`, `lib/utils.ts`, shadcn files under `components/SCN/` (button, input, textarea, label, card, badge, separator, spinner, table, dialog, tooltip, select, checkbox, sonner), `components/SCN/input.module.scss`, `components/SCN/textarea.module.scss`, `components/SCN/label.module.scss`, `components/SCN/sonner.module.scss`
- Modify: `app/layout.tsx` (import SCN stylesheet), `app/(site)/page.tsx` (Spinner button)
- Test: `tests/components/SCN/input.test.tsx`, `tests/components/SCN/textarea.test.tsx`, `tests/components/SCN/button.test.tsx`

**Interfaces:**
- Produces: `Button` (`variant`, `size`, `asChild`, `loading?: boolean`), `Input` and `Textarea` (`label?: string`, `error?: string`, `required`, all native props incl. React 19 `ref`), `Label` (`required?: boolean`), stock shadcn `Card*`, `Badge`, `Separator`, `Spinner`, `Table*`, `Dialog*`, `Tooltip*`/`TooltipProvider`, `Select*`, `Checkbox`, `Toaster`; `cn()` in `lib/utils.ts`.

- [ ] **Step 1: `components.json`:**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "components/SCN/tailwind/styles.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/SCN",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 2: Add components.** `bunx shadcn@latest add button input textarea label card badge separator spinner table dialog tooltip select checkbox sonner --yes`. If the CLI requires `init` first, run `bunx shadcn@latest init` non-interactively with the values above and keep `components.json` as written. Move any file it writes outside `components/SCN`, `lib/utils.ts`, or `hooks/` back to the right place.

- [ ] **Step 3: Scope Tailwind and map tokens.** Rewrite `components/SCN/tailwind/styles.css` so Tailwind only scans SCN and colors come from the template tokens (delete the oklch `:root`/`.dark` blocks shadcn injected):

```css
@import 'tailwindcss' source(none);
@source '../';
@import 'tw-animate-css';

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--color-border-hsl));
  --color-ring: hsl(var(--ring));
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-tertiary: hsl(var(--tertiary));
  --color-tertiary-foreground: hsl(var(--tertiary-foreground));
  --color-success: hsl(var(--success));
  --color-success-foreground: hsl(var(--success-foreground));
  --color-warning: hsl(var(--warning));
  --color-warning-foreground: hsl(var(--warning-foreground));
  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-popover: hsl(var(--color-surface-hsl));
  --color-popover-foreground: hsl(var(--color-text-hsl));
  --color-card: hsl(var(--color-surface-hsl));
  --color-card-foreground: hsl(var(--color-text-hsl));
  --radius-xl: calc(var(--radius) + 4px);
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
  --font-sans: var(--font-family-primary);
}

@layer base {
  * {
    border-color: hsl(var(--border));
  }
}
```

This mirrors the Nuxt `tailwind.config.ts` color map; verify each referenced variable exists in `styles/variables.scss` output (grep the compiled CSS in `.next` after a build) and fix names that differ. Install `bun add -d tw-animate-css` if shadcn did not. Import `@/components/SCN/tailwind/styles.css` in `app/layout.tsx` **before** `@/styles/global.scss`. Delete `postcss.config.mjs` only if shadcn's setup no longer needs it (it does for Tailwind v4 — keep it).

- [ ] **Step 4: Write failing tests.** `tests/components/SCN/input.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Input } from '@/components/SCN/input'

describe('Input', () => {
  it('associates its label and marks required fields', () => {
    render(<Input label="Title" required />)
    const input = screen.getByLabelText(/Title/)
    expect(input).toBeRequired()
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders an error and links it to the control', () => {
    render(<Input label="Title" error="Title is required" />)
    const input = screen.getByLabelText('Title')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Title is required')
  })

  it('lets callers override the ARIA fallbacks and keeps a caller id', () => {
    render(<Input label="Title" id="post-title" aria-invalid={false} error="Bad" />)
    const input = screen.getByLabelText('Title')
    expect(input).toHaveAttribute('id', 'post-title')
    expect(input).toHaveAttribute('aria-invalid', 'false')
  })
})
```

`tests/components/SCN/textarea.test.tsx`: the same three tests against `Textarea` with label "Body" and error "Body is required".

`tests/components/SCN/button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from '@/components/SCN/button'

describe('Button', () => {
  it('disables itself and reports busy while loading', () => {
    render(<Button loading>Save</Button>)
    const button = screen.getByRole('button', { name: /Save/ })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('is enabled and not busy by default', () => {
    render(<Button>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute('aria-busy')
  })
})
```

Run `bun run test` → the new tests FAIL.

- [ ] **Step 5: Implement the portable APIs** (port the API, not the Vue visuals; read `components/SCN/{input,textarea,label,button}` in the Nuxt template for intent):
  - `label.tsx`: add `required?: boolean`; when true render `<span className={styles.requiredMarker} aria-hidden="true">*</span>` after children. `label.module.scss`: `.requiredMarker { margin-left: 0.125rem; color: var(--color-danger); }`.
  - `input.tsx` (same shape for `textarea.tsx`):

```tsx
import { useId, type ComponentProps } from 'react'
import { Label } from '@/components/SCN/label'
import { cn } from '@/lib/utils'
import styles from './input.module.scss'

type InputProps = ComponentProps<'input'> & {
  label?: string
  error?: string
}

function Input({ className, type, label, error, required, id, ...props }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`

  return (
    <div className={styles.field}>
      {label && (
        <Label htmlFor={inputId} required={required}>
          {label}
        </Label>
      )}
      <input
        id={inputId}
        type={type}
        data-slot="input"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(/* keep shadcn's generated class arrays unchanged */ className)}
        {...props}
      />
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  )
}

export { Input }
```

  Keep shadcn's generated Tailwind classes for the `<input>` (they already style `aria-invalid`), split into arrays so lines stay ≤ 100. `input.module.scss`:

```scss
.field {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.error {
  margin: 0;
  color: var(--color-danger);
  font-size: 0.875rem;
  line-height: 1.25rem;
}
```

  - `button.tsx`: add `loading?: boolean`. When loading: `disabled`, `aria-busy="true"`, render `<Spinner />` before children (skip the spinner when `asChild`, because `Slot` needs a single child). Spread props last so callers can still set `aria-*`; `disabled={disabled || loading}` stays authoritative.
  - `sonner.tsx`: remove the inline `style` object; theme the toaster through `sonner.module.scss` applied to the Toaster's own `className` inside SCN, porting the `.app-toaster` rules from the Nuxt `app.vue` (`--normal-bg: var(--color-bg)`, `--normal-border: var(--color-border)`, `--normal-text: var(--color-text)`, radius, shadow, description/button/cancel colors). Default `position="top-right"`, `theme="light"`. Remove any `next-themes` dependency the generated file adds (theme switching is deferred).

- [ ] **Step 6: Home Spinner button.** In `app/(site)/page.tsx` add `<Button size="sm"><Spinner />Sowlutions</Button>` under the heading (port of the Nuxt home page; `tertiary` variant is not ported — use default).

- [ ] **Step 7: Verify.** Tests PASS; `grep -rn "className=\"[^\"]*[a-z]-[0-9]" app components --include=*.tsx | grep -v components/SCN` returns nothing (no Tailwind outside SCN); lint/typecheck/format pass. Commit: `Task 3: shadcn primitives with template conventions`.

---

### Task 4: App shell and shared app components

**Files:**
- Create: `app/providers.tsx`, `hooks/useScrollLock.ts`, `components/Layout/NavBar/index.tsx` + `styles.module.scss`, `components/Layout/BottomFooter/index.tsx` + `styles.module.scss`, `components/PageHeader/index.tsx` + `styles.module.scss`, `components/Empty/index.tsx` + `styles.module.scss`, `components/Pagination/index.tsx` + `styles.module.scss`, `app/not-found.tsx`
- Modify: `app/layout.tsx` (wrap in `Providers`), `app/(site)/layout.tsx` (NavBar + footer)
- Test: `tests/hooks/useScrollLock.test.tsx`, `tests/components/Pagination.test.tsx`

**Interfaces:**
- Produces: `Providers({ children })` (client; renders `TooltipProvider`, children, `<Toaster />`; Task 7 adds the QueryClient and Task 9 adds `UserBootstrap`); `useScrollLock(): { lockScroll(): void; unlockScroll(): void }`; `NavBar()` (client; `user` area added in Task 9); `BottomFooter()`; `PageHeader({ title, description?, actions? })`; `Empty({ title, description?, action? })`; `Pagination({ page, totalPages, onPageChange, disabled? })`.

- [ ] **Step 1: Failing tests.** `tests/hooks/useScrollLock.test.tsx`:

```tsx
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useScrollLock } from '@/hooks/useScrollLock'

describe('useScrollLock', () => {
  it('locks while any owner holds the lock and unlocks on unmount', () => {
    const first = renderHook(() => useScrollLock())
    const second = renderHook(() => useScrollLock())
    act(() => {
      first.result.current.lockScroll()
      second.result.current.lockScroll()
    })
    expect(document.body).toHaveClass('is-scroll-locked')
    act(() => first.result.current.unlockScroll())
    expect(document.body).toHaveClass('is-scroll-locked')
    second.unmount()
    expect(document.body).not.toHaveClass('is-scroll-locked')
    expect(document.documentElement).not.toHaveClass('is-scroll-locked')
  })
})
```

`tests/components/Pagination.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Pagination } from '@/components/Pagination'

describe('Pagination', () => {
  it('reports the current page and moves between pages', async () => {
    const onPageChange = vi.fn()
    render(<Pagination page={2} totalPages={3} onPageChange={onPageChange} />)
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onPageChange.mock.calls).toEqual([[1], [3]])
  })

  it('disables the edges', () => {
    render(<Pagination page={1} totalPages={1} onPageChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })
})
```

Run → FAIL.

- [ ] **Step 2: `hooks/useScrollLock.ts`** — port of the Nuxt composable: module-level `Set<symbol>` of owners; `syncScrollLockClass()` toggles `is-scroll-locked` on `document.documentElement` and `document.body`; the hook keeps its owner symbol in `useRef`, exposes stable `lockScroll`/`unlockScroll` (`useCallback`), and calls `unlockScroll` in a `useEffect` cleanup. File starts with `'use client'`.

- [ ] **Step 3: Components.**
  - `Pagination` (client): `<nav aria-label="Pagination">` with an outline `Button` "Previous page" (lucide `ChevronLeft`, `aria-label="Previous page"`), `<span>Page {page} of {totalPages}</span>`, and "Next page" (`ChevronRight`). Disabled at the edges or when `disabled`. Use `size="icon"` if shadcn generated it, else `size="sm"`.
  - `PageHeader`: port the Nuxt `components/PageHeader` markup/SCSS; `actions` is a `ReactNode` slot.
  - `Empty`: port the Nuxt `components/Empty`; props `title`, `description?`, `action?: ReactNode`.
  - `BottomFooter`: port the Nuxt `components/BottomFooter` markup/SCSS; text uses `env.appName` and the current year.
  - `NavBar` (client): port the Nuxt `components/NavBar` structure and SCSS — brand link (`env.appName`) to `ROUTE_HOME`; links `Posts` (`ROUTE_POSTS`), `UI Kit` (`ROUTE_UI_KIT`), `Private` (`ROUTE_PRIVATE`) via `next/link`; mobile menu toggle button (lucide `Menu`/`X`, `aria-expanded`, `aria-controls`) that calls `lockScroll`/`unlockScroll`; closes on link click and when `window.matchMedia(\`(min-width: ${BREAKPOINTS.md})\`)` matches on resize. Leave a clearly named empty right-hand container `.accountArea` (filled in Task 9). Drop the Nuxt hash links (`#create`, `#connect`, `#partner`) — they pointed at sections that do not exist.
  - `app/not-found.tsx`: `<Empty title="Page not found" description="The page you are looking for does not exist." action={<Button asChild><Link href={ROUTE_HOME}>Go home</Link></Button>} />` inside a centered SCSS container.
  - `app/providers.tsx` (`'use client'`): `TooltipProvider` → `children` → `<Toaster />`. Wrap `{children}` in `app/layout.tsx` body with `<Providers>`.
  - `(site)/layout.tsx`: `<NavBar />`, the existing container, `<BottomFooter />`.

- [ ] **Step 4: Verify.** Tests PASS, lint/typecheck/format pass. Commit: `Task 4: app shell and shared components`.

---

### Task 5: UI kit catalog page

**Files:**
- Create: `app/(site)/ui-kit/page.tsx`, `app/(site)/ui-kit/view.tsx`, `app/(site)/ui-kit/styles.module.scss`

**Interfaces:**
- Consumes: every SCN component from Task 3 and `PageHeader`, `Empty`, `Pagination` from Task 4.

- [ ] **Step 1:** `page.tsx` exports `metadata = { title: 'UI Kit' }` and renders `<UiKitView />`. `view.tsx` (`'use client'`) renders one `<section>` per component with an eyebrow + heading, in the Nuxt `pages/ui-kit` visual style (port the relevant parts of its `styles.scss`):
  - Button: every variant × the default size, every size, `loading`, `disabled`.
  - Input: plain, with label, required, with `error="This field is required"`, disabled.
  - Textarea: with label, required, with error.
  - Label (with and without `required`), Checkbox (checked/unchecked/disabled, wrapped in a native `<label>`), Select (3 options, placeholder), Badge (each variant), Card (header/content/footer), Separator, Spinner, Table (3 rows), Dialog (trigger + title/description/footer), Tooltip, toast triggers (`toast()`, `toast.success()`, `toast.error()`).
  - App components: `PageHeader` with an action button, `Empty` with an action, `Pagination` with local `useState`.
- [ ] **Step 2: Verify.** `bun run build` passes; dev server `curl -s localhost:3000/ui-kit | grep -c "<section"` ≥ 14. lint/typecheck/test/format pass. Commit: `Task 5: UI kit catalog`.

---

## Phase 2 — Data, API layer, presenters, forms (Tasks 6–11)

### Task 6: Prisma ORM and database

**Files:**
- Create: `prisma/schema.prisma` (or the schema path Prisma 8 init produces), Prisma 8 config file (e.g. `prisma.config.ts`), `prisma/migrations/**`, `prisma/seed.ts`, `server/db.ts`, `.env.example`, `.env.test.example`, `.env`, `.env.test` (untracked), `docker-compose.yml`
- Modify: `package.json` (deps + db scripts), `.gitignore` (generated client path if different), `vitest.config.mts` (`server-only` alias)
- Create (test support): `tests/mocks/server-only.ts`
- Test: `tests/server/db.test.ts`

**Interfaces:**
- Produces: `db` (Prisma client singleton) from `@/server/db`; Prisma models `User`, `Post`, `Session`; model types importable for serializers; scripts `db:migrate`, `db:deploy`, `db:seed`, `db:studio`, `db:test:prepare`.

- [ ] **Step 1: Follow the Prisma setup skill.** Read `/Users/abdoachkar/.claude/skills/prisma-orm-setup/SKILL.md` and follow its Step 3 → Step 4 path for a **new Prisma 8 application with PostgreSQL**: pin the CLI to exactly `prisma@8.0.0-rc.19` (`bun add -d prisma@8.0.0-rc.19`) and whatever exact client/adapter packages the Prisma 8 guidance names (pin exact versions, no `^`); run `bunx prisma orm init --yes --target postgres --authoring psl`; run `bunx prisma skills sync`; **read** the synced `prisma-8/SKILL.md` (e.g. `.agents/skills/prisma-8/SKILL.md`) and follow it for config, client generation, client instantiation, migrations, and seeding. Do not let init provision a hosted database; point it at the local URL below. If the synced skill lands in a tracked directory, add it to `.gitignore` unless the guidance says to commit it. If Prisma 8 cannot work here, stop and report BLOCKED (do not silently fall back to Prisma 7).

- [ ] **Step 2: Env files.** `.env` and `.env.test` (untracked):

```
DATABASE_URL="postgresql://abdoachkar@localhost:5432/next_template_dev"
```

```
DATABASE_URL="postgresql://abdoachkar@localhost:5432/next_template_test"
```

`.env.example` / `.env.test.example` hold the same keys with `postgresql://postgres:postgres@localhost:5432/next_template_dev` / `…_test`, plus `NEXT_PUBLIC_APP_NAME="Next Template"` and a commented `# NEXT_PUBLIC_API_BASE_URL=/api/v1` in `.env.example`. Create the databases: `createdb next_template_dev; createdb next_template_test` (ignore "already exists").

- [ ] **Step 3: Schema** (PSL; keep whatever generator/datasource blocks Prisma 8 guidance requires):

```prisma
model User {
  id        Int       @id @default(autoincrement())
  name      String
  username  String    @unique
  email     String    @unique
  phone     String?
  website   String?
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  posts     Post[]
  sessions  Session[]

  @@map("users")
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  body      String
  userId    Int      @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([userId])
  @@map("posts")
}

model Session {
  id        Int      @id @default(autoincrement())
  tokenHash String   @unique @map("token_hash")
  userId    Int      @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([userId])
  @@map("sessions")
}
```

Generated client output goes to `generated/prisma` (git-ignored) unless the Prisma 8 guidance mandates another path; add a `postinstall` script that generates the client so fresh clones build.

- [ ] **Step 4: `server/db.ts`.** Instantiate the client exactly as the Prisma 8 guidance prescribes for PostgreSQL in a long-running Node server, reading `process.env.DATABASE_URL`, cached on `globalThis` in development to survive HMR:

```ts
import 'server-only'
// imports per Prisma 8 guidance

const globalForDb = globalThis as unknown as { db?: PrismaClient }

export const db = globalForDb.db ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForDb.db = db
}
```

`bun add server-only`. Vitest cannot import `server-only`; add to `vitest.config.mts` `resolve.alias: { 'server-only': fileURLToPath(new URL('./tests/mocks/server-only.ts', import.meta.url)) }` with an empty `tests/mocks/server-only.ts` (`export {}`).

- [ ] **Step 5: Migration + seed.** Create the initial migration named `init` against the dev DB. `prisma/seed.ts` upserts by email these users, then (re)creates 4 posts each with titles `"<First name>'s post #<n>"` and two-sentence bodies:

| name | username | email | phone | website |
| --- | --- | --- | --- | --- |
| Leanne Graham | leanne | leanne@example.com | 1-770-736-8031 | hildegard.org |
| Ervin Howell | ervin | ervin@example.com | 010-692-6593 | anastasia.net |
| Clementine Bauch | clementine | clementine@example.com | null | null |

The seed must be idempotent (running it twice leaves 3 users and 12 posts). Wire it as Prisma's seed command per Prisma 8 guidance.

- [ ] **Step 6: Scripts** (`package.json`; use the Prisma 8 CLI's actual command spelling):
  - `db:migrate` → create/apply dev migrations; `db:deploy` → apply migrations without prompts; `db:seed` → run seed; `db:studio` → Prisma Studio.
  - `db:test:prepare` → reset the **test** database from `.env.test` and apply all migrations, no seed. It must read `.env.test`, not `.env` (e.g. via `DOTENV_CONFIG_PATH=.env.test` if the Prisma config loads `dotenv/config`, or an explicit `--url`); verify by checking `psql next_template_test -c '\dt'` lists `users`, `posts`, `sessions` while the dev DB keeps its seed data.

- [ ] **Step 7: Failing → passing smoke test** `tests/server/db.test.ts`:

```ts
// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '@/server/db'

describe('database connection', () => {
  it('targets the test database', () => {
    expect(process.env.DATABASE_URL).toContain('next_template_test')
  })

  it('can query the users table', async () => {
    await expect(db.user.count()).resolves.toBeTypeOf('number')
  })

  afterAll(async () => {
    await db.$disconnect()
  })
})
```

Vitest loads `.env.test` because `loadEnv(mode='test')` reads `.env.test` over `.env`. Confirm the first assertion passes (it guards every later server test). Run `bun run db:test:prepare && bun run test`.

- [ ] **Step 8: `docker-compose.yml`:**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: next_template_dev
    ports:
      - '5432:5432'
    volumes:
      - db-data:/var/lib/postgresql/data

volumes:
  db-data:
```

- [ ] **Step 9: Verify.** `bun run db:seed` twice → `psql next_template_dev -c 'select count(*) from posts'` = 12. Run lint/typecheck/test/format. Append a row to `docs/DECISIONS.md` only if Prisma 8 forced a choice not already recorded (e.g. adapter package). Commit: `Task 6: Prisma 8 with PostgreSQL, schema, and seed`.

---

### Task 7: Client API layer (Revcube structure)

**Files:**
- Create: `types/api.ts`, `services/api.ts`, `services/ApiError.ts`, `services/ApiSuccess.ts`, `services/PostsService.ts`, `services/UsersService.ts`, `services/AuthService.ts`, `services/MeService.ts`, `lib/errorMessage.ts`, `lib/apiCall.ts`, `lib/queryKeys.ts`, `hooks/useApiData.ts`
- Modify: `app/providers.tsx` (QueryClient)
- Test: `tests/lib/errorMessage.test.ts`, `tests/services/api.test.ts`, `tests/lib/apiCall.test.ts`

**Interfaces:**
- Produces (exact):
  - `types/api.ts`: `ValidationErrors`, `ApiResponse<T>`, `Listing<T, E>`, `Permissions`, `ApiErrorBody`.
  - `services/api.ts`: default `API` class; `export type { ApiResponse, Listing } from '@/types/api'`; `normalizeValidationErrors`, `formatValidationErrors`.
  - `PostsService.list(params?: PostListParams, signal?: AbortSignal)`, `.getById(id: number, signal?)`, `.create(post: CreatePostAttributes)`, `.update(id: number, post: PostAttributes)`, `.destroy(id: number)`; types `PostResponse`, `PostDetailedResponse`, `PostListParams`, `PostAttributes`, `CreatePostAttributes`.
  - `UsersService.getById(id: number, signal?)`; type `UserResponse`.
  - `AuthService.createSession(email: string)`, `.getSession()`, `.revokeSession()`; type `SessionResponse`.
  - `MeService.getProfile()`; types `CurrentUserResponse`, `MeResponse`.
  - `sFetch`, `sData`, `mFetch`, `mData`, types `ApiCallOptions`, `ApiBatchOptions`, `LoadingTarget`.
  - `humanizeErrorMessage`, `isNetworkErrorMessage`, `NETWORK_ERROR_MESSAGE`.
  - `queryKeys.posts(params)`, `queryKeys.post(id)`.
  - `useApiData<T>(key, fetcher, options?)` → `{ data, isLoading, error, errorMessage, hasData, refresh }`.

- [ ] **Step 1: Contract types** `types/api.ts`:

```ts
export type ValidationErrors = Record<string, string[]>

export interface ApiResponse<T> {
  success: boolean
  data: T | null
  status: number
  message: string
  errors?: ValidationErrors
}

export interface Listing<T, E = Record<string, unknown>> {
  list: T[]
  extra_data: E
  limit_value: number
  total_pages: number
  total_count: number
  current_page: number
  next_page: number | null
  prev_page: number | null
}

export interface Permissions {
  update: boolean
  destroy: boolean
}

export interface ApiErrorBody {
  message: string
  errors?: ValidationErrors
}
```

- [ ] **Step 2: `services/ApiError.ts` and `services/ApiSuccess.ts`:**

```ts
import type { ApiResponse, ValidationErrors } from '@/types/api'

export class ApiError extends Error {
  status: number
  errors?: ValidationErrors

  constructor(status: number, message: string, errors?: ValidationErrors) {
    super(message)
    this.status = status
    this.errors = errors
    this.name = 'ApiError'
  }

  toResponse<T = never>(): ApiResponse<T> {
    return {
      success: false,
      status: this.status,
      message: this.message,
      data: null,
      ...(this.errors && { errors: this.errors }),
    }
  }
}
```

```ts
import type { ApiResponse } from '@/types/api'

export class ApiSuccess<T> {
  static defaultMessage = 'Operation completed successfully'

  constructor(
    private message: string = ApiSuccess.defaultMessage,
    private status = 200,
  ) {}

  createResponse(data: T | null): ApiResponse<T> {
    return { success: true, status: this.status, message: this.message, data }
  }
}
```

- [ ] **Step 3: Failing tests.** `tests/lib/errorMessage.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { NETWORK_ERROR_MESSAGE, humanizeErrorMessage } from '@/lib/errorMessage'

describe('humanizeErrorMessage', () => {
  it('passes empty values through', () => {
    expect(humanizeErrorMessage(undefined)).toBeUndefined()
  })

  it('replaces transport failures with friendly copy', () => {
    expect(humanizeErrorMessage('Network Error')).toBe(NETWORK_ERROR_MESSAGE)
    expect(humanizeErrorMessage('Failed to fetch')).toBe(NETWORK_ERROR_MESSAGE)
  })

  it('strips a request prefix', () => {
    expect(humanizeErrorMessage('[GET] "https://x/api": 404 Not Found')).toBe('404 Not Found')
  })
})
```

`tests/services/api.test.ts`:

```ts
import { AxiosError, CanceledError, type AxiosResponse } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import API from '@/services/api'

class TestApi extends API {
  static instance() {
    return this.axiosInstance
  }
  static callGet<T>(url: string) {
    return this.get<T>(url)
  }
}

function axiosFailure(status: number, data: unknown) {
  const response = { status, data, statusText: '', headers: {}, config: {} } as AxiosResponse
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, null, response)
}

describe('API.makeRequest', () => {
  afterEach(() => vi.restoreAllMocks())

  it('wraps success payloads', async () => {
    vi.spyOn(TestApi.instance(), 'request').mockResolvedValue({ status: 201, data: { id: 1 } })
    await expect(TestApi.callGet('/posts')).resolves.toEqual({
      success: true,
      status: 201,
      message: 'Request successful',
      data: { id: 1 },
    })
  })

  it('formats validation errors and keeps them per field', async () => {
    vi.spyOn(TestApi.instance(), 'request').mockRejectedValue(
      axiosFailure(422, { message: 'Validation failed', errors: { title: ['Title is required'] } }),
    )
    await expect(TestApi.callGet('/posts')).resolves.toEqual({
      success: false,
      status: 422,
      message: 'title: Title is required',
      data: null,
      errors: { title: ['Title is required'] },
    })
  })

  it('uses the server message when there are no field errors', async () => {
    vi.spyOn(TestApi.instance(), 'request').mockRejectedValue(
      axiosFailure(403, { message: 'You cannot edit this post' }),
    )
    const response = await TestApi.callGet('/posts/1')
    expect(response).toMatchObject({ success: false, status: 403 })
    expect(response.message).toBe('You cannot edit this post')
  })

  it('maps cancellations to 499', async () => {
    vi.spyOn(TestApi.instance(), 'request').mockRejectedValue(new CanceledError())
    await expect(TestApi.callGet('/posts')).resolves.toMatchObject({ success: false, status: 499 })
  })

  it('maps network failures to 500 with the transport message', async () => {
    vi.spyOn(TestApi.instance(), 'request').mockRejectedValue(new AxiosError('Network Error'))
    await expect(TestApi.callGet('/posts')).resolves.toMatchObject({
      success: false,
      status: 500,
      message: 'Network Error',
    })
  })
})
```

`tests/lib/apiCall.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mFetch, sData, sFetch } from '@/lib/apiCall'
import type { ApiResponse } from '@/types/api'

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

const ok = <T,>(data: T): ApiResponse<T> => ({ success: true, status: 200, message: 'ok', data })
const failed = (message: string): ApiResponse<never> => ({
  success: false,
  status: 422,
  message,
  data: null,
})

describe('apiCall helpers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('toggles loading around a successful request', async () => {
    const states: boolean[] = []
    const response = await sFetch(async () => ok(1), { loading: (value) => states.push(value) })
    expect(response.data).toBe(1)
    expect(states).toEqual([true, false])
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it('toasts and throws on failure by default', async () => {
    await expect(sFetch(async () => failed('Nope'))).rejects.toThrow('Nope')
    expect(toastMock.error).toHaveBeenCalledWith('Nope')
  })

  it('returns the failure quietly when asked', async () => {
    const response = await sFetch(async () => failed('Nope'), {
      toast: false,
      throwOnError: false,
    })
    expect(response).toMatchObject({ success: false, message: 'Nope', data: null })
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it('humanizes transport errors', async () => {
    await expect(
      sFetch(async () => failed('Network Error'), { throwOnError: false }),
    ).resolves.toMatchObject({ message: 'Connection problem. Check your internet connection.' })
  })

  it('returns data directly with sData', async () => {
    await expect(sData(async () => ok({ id: 7 }))).resolves.toEqual({ id: 7 })
  })

  it('toasts once for a batch in first mode', async () => {
    await mFetch([async () => failed('A'), async () => failed('B')], {
      toastMode: 'first',
      throwOnError: false,
    })
    expect(toastMock.error).toHaveBeenCalledTimes(1)
    expect(toastMock.error).toHaveBeenCalledWith('A')
  })
})
```

Run → FAIL.

- [ ] **Step 4: `lib/errorMessage.ts`** — copy Revcube's `lib/errorMessage.ts` verbatim (it already matches axios' `Network Error`).

- [ ] **Step 5: `services/api.ts`:**

```ts
import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { env } from '@/lib/env'
import type { ApiResponse, ValidationErrors } from '@/types/api'
import { ApiError } from './ApiError'
import { ApiSuccess } from './ApiSuccess'

export type { ApiResponse, Listing } from '@/types/api'

export interface ApiConfig {
  baseURL?: string
  headers?: Record<string, string>
  resourcePath?: string
}

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

type ApiErrorResponseData = {
  message?: unknown
  errors?: Record<string, unknown>
  data?: { message?: unknown; errors?: Record<string, unknown> }
}

export function normalizeValidationErrors(
  errors?: Record<string, unknown>,
): ValidationErrors | undefined {
  if (!errors || Object.keys(errors).length === 0) {
    return undefined
  }
  return Object.fromEntries(
    Object.entries(errors).map(([field, messages]) => [
      field,
      (Array.isArray(messages) ? messages : [messages]).map(String),
    ]),
  )
}

export function formatValidationErrors(errors?: ValidationErrors) {
  if (!errors) {
    return undefined
  }
  return Object.entries(errors)
    .flatMap(([field, messages]) => messages.map((message) => `${field}: ${message}`))
    .join('; ')
}

async function readErrorBody(raw: unknown): Promise<ApiErrorResponseData | undefined> {
  if (typeof Blob !== 'undefined' && raw instanceof Blob) {
    try {
      return JSON.parse(await raw.text())
    } catch {
      return undefined
    }
  }
  return raw && typeof raw === 'object' ? (raw as ApiErrorResponseData) : undefined
}

// This API client is intentionally a static singleton (Revcube structure).
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class API {
  protected static axiosInstance: AxiosInstance
  protected static resourcePath = ''

  public static initialize(config: ApiConfig): void {
    this.axiosInstance = axios.create({ baseURL: config.baseURL, headers: config.headers })
    this.resourcePath = config.resourcePath ?? ''
  }

  public static setDefaultResourcePath(path: string): void {
    this.resourcePath = path
  }

  public static setHeaders(headers: Record<string, string>): void {
    Object.assign(this.axiosInstance.defaults.headers.common, headers)
  }

  public static addRequestInterceptor(
    onFulfilled?: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig,
    onRejected?: (error: unknown) => unknown,
  ): number {
    return this.axiosInstance.interceptors.request.use(onFulfilled, onRejected)
  }

  public static removeRequestInterceptor(id: number): void {
    this.axiosInstance.interceptors.request.eject(id)
  }

  public static addResponseInterceptor(
    onFulfilled?: (response: AxiosResponse) => AxiosResponse,
    onRejected?: (error: unknown) => unknown,
  ): number {
    return this.axiosInstance.interceptors.response.use(onFulfilled, onRejected)
  }

  public static removeResponseInterceptor(id: number): void {
    this.axiosInstance.interceptors.response.eject(id)
  }

  protected static concatUrl(url: string): string {
    return this.resourcePath ? `${this.resourcePath}/${url}` : url
  }

  protected static async makeRequest<T>(
    method: HttpMethod,
    url: string,
    data?: unknown,
    params?: object,
    signal?: AbortSignal,
    responseType?: 'json' | 'blob',
    successMessage = 'Request successful',
  ): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await this.axiosInstance.request<T>({
        method,
        url: this.concatUrl(url),
        data,
        params,
        signal,
        responseType,
      })
      return new ApiSuccess<T>(successMessage, response.status).createResponse(
        response.data ?? null,
      )
    } catch (error) {
      if (axios.isCancel(error)) {
        return new ApiError(499, 'Request canceled').toResponse()
      }
      if (axios.isAxiosError(error)) {
        const status = error.response?.status ?? 500
        const body = await readErrorBody(error.response?.data)
        const errors = normalizeValidationErrors(body?.errors ?? body?.data?.errors)
        const serverMessage = body?.message ?? body?.data?.message
        const message =
          formatValidationErrors(errors) ||
          (typeof serverMessage === 'string' && serverMessage) ||
          error.message ||
          'An unknown error occurred'
        return new ApiError(status, message, errors).toResponse()
      }
      return new ApiError(500, 'An unknown error occurred').toResponse()
    }
  }

  public static get<T>(url: string, params?: object, signal?: AbortSignal) {
    return this.makeRequest<T>('get', url, undefined, params, signal)
  }

  public static post<T>(url: string, data?: object, params?: object) {
    return this.makeRequest<T>('post', url, data, params)
  }

  public static put<T>(url: string, data?: object, params?: object) {
    return this.makeRequest<T>('put', url, data, params)
  }

  public static patch<T>(url: string, data?: object, params?: object) {
    return this.makeRequest<T>('patch', url, data, params)
  }

  public static delete<T = null>(url: string, params?: object) {
    return this.makeRequest<T>('delete', url, undefined, params)
  }

  public static downloadFile(url: string, params?: object) {
    return this.makeRequest<Blob>(
      'get',
      url,
      undefined,
      params,
      undefined,
      'blob',
      'File downloaded successfully',
    )
  }

  public static uploadFile<T = unknown>(url: string, file: File, params?: object) {
    const formData = new FormData()
    formData.append('file', file)
    return this.makeRequest<T>(
      'post',
      url,
      formData,
      params,
      undefined,
      undefined,
      'File uploaded successfully',
    )
  }
}

API.initialize({ baseURL: env.apiBaseUrl })

export default API
```

`bun add axios`. If `@typescript-eslint/no-extraneous-class` is not enabled, drop the disable comment (unused disables fail lint).

- [ ] **Step 6: Services** (types co-located, Revcube style):

```ts
// services/UsersService.ts
import API from './api'

export interface UserResponse {
  id: number
  created_at: string
  updated_at: string
  name: string
  username: string
  phone: string | null
  website: string | null
}

class UsersService extends API {
  public static getById(id: number, signal?: AbortSignal) {
    return this.get<UserResponse>(`/users/${id}`, undefined, signal)
  }
}

export default UsersService
```

```ts
// services/PostsService.ts
import type { Permissions } from '@/types/api'
import API, { type Listing } from './api'
import type { UserResponse } from './UsersService'

export interface PostResponse {
  id: number
  created_at: string
  updated_at: string
  permissions: Permissions
  title: string
  body: string
  user_id: number
}

export interface PostDetailedResponse extends PostResponse {
  user: UserResponse
}

export type PostListParams = Partial<{
  page: number
  per_page: number
  user_id: number
}>

export type PostAttributes = Partial<{
  title: string
  body: string
}>

export type CreatePostAttributes = PostAttributes & { title: string; body: string }

class PostsService extends API {
  public static list(params?: PostListParams, signal?: AbortSignal) {
    return this.get<Listing<PostResponse>>('/posts', params, signal)
  }

  public static getById(id: number, signal?: AbortSignal) {
    return this.get<PostDetailedResponse>(`/posts/${id}`, undefined, signal)
  }

  public static create(post: CreatePostAttributes) {
    return this.post<PostDetailedResponse>('/posts', { post })
  }

  public static update(id: number, post: PostAttributes) {
    return this.patch<PostDetailedResponse>(`/posts/${id}`, { post })
  }

  public static destroy(id: number) {
    return this.delete<null>(`/posts/${id}`)
  }
}

export default PostsService
```

```ts
// services/MeService.ts
import API from './api'
import type { UserResponse } from './UsersService'

export interface CurrentUserResponse extends UserResponse {
  email: string
}

export interface MeResponse {
  user: CurrentUserResponse
}

class MeService extends API {
  public static getProfile() {
    return this.get<MeResponse>('/me')
  }
}

export default MeService
```

```ts
// services/AuthService.ts
import API from './api'
import type { CurrentUserResponse } from './MeService'

export interface SessionResponse {
  user: CurrentUserResponse
  expires_at: string
}

class AuthService extends API {
  public static createSession(email: string) {
    return this.post<SessionResponse>('/auth/session', { session: { email } })
  }

  public static getSession() {
    return this.get<SessionResponse>('/auth/session')
  }

  public static revokeSession() {
    return this.delete<null>('/auth/session')
  }
}

export default AuthService
```

- [ ] **Step 7: `lib/apiCall.ts`** — port Revcube's `lib/apiCall.ts` with these exact changes: import `toast` from `sonner` instead of `$toast`; import `ApiResponse` from `@/types/api` instead of declaring it (one canonical type); skip toasting when `typeof window === 'undefined'`; generic typing for batches as in the Nuxt template (`requests: { [K in keyof T]: () => Promise<ApiResponse<T[K]>> }`, result `{ [K in keyof T]: ApiResponse<T[K]> }`); every synthesized failure includes `data: null` (and keeps `errors` from the original response); default `toastMode` is `'each'` (as both sources implement, despite their doc comment) — fix the doc comment to say `'each'` is the default. `ApiCallOptions`, `ApiBatchOptions`, `LoadingTarget = ((value: boolean) => void)` (no Vue `Ref` — React callers pass a setter).

- [ ] **Step 8: Query keys and hook.** `lib/queryKeys.ts`:

```ts
import type { PostListParams } from '@/services/PostsService'

export const queryKeys = {
  posts: (params: PostListParams = {}) => ['posts', params] as const,
  post: (id: number) => ['post', id] as const,
}
```

`hooks/useApiData.ts`:

```ts
'use client'

import { useQuery, type QueryKey } from '@tanstack/react-query'
import { sData, type ApiCallOptions } from '@/lib/apiCall'
import type { ApiResponse } from '@/types/api'

type UseApiDataOptions = Pick<ApiCallOptions, 'toast' | 'fallbackErrorMessage'> & {
  enabled?: boolean
}

export function useApiData<T>(
  key: QueryKey,
  fetcher: (signal: AbortSignal) => Promise<ApiResponse<T>>,
  { enabled = true, ...callOptions }: UseApiDataOptions = {},
) {
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => sData(() => fetcher(signal), callOptions),
    enabled,
  })

  return {
    data: query.data ?? null,
    isLoading: enabled && query.isPending,
    error: query.error,
    errorMessage: query.error?.message ?? '',
    hasData: query.data != null,
    refresh: query.refetch,
  }
}
```

`bun add @tanstack/react-query`. In `app/providers.tsx`, create the client once with `useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }))` and wrap everything in `QueryClientProvider`.

- [ ] **Step 9: Verify.** Tests PASS; lint/typecheck/format pass. Commit: `Task 7: Revcube-style client API layer`.

---

### Task 8: Server layer and Route Handlers

**Files:**
- Create: `lib/validation/posts.ts`, `lib/validation/auth.ts`, `server/http.ts`, `server/auth.ts`, `server/serializers/user.ts`, `server/serializers/post.ts`, `server/repositories/posts.ts`, `server/repositories/users.ts`, `app/api/v1/posts/route.ts`, `app/api/v1/posts/[id]/route.ts`, `app/api/v1/users/[id]/route.ts`, `app/api/v1/auth/session/route.ts`, `app/api/v1/me/route.ts`, `tests/server/helpers.ts`
- Test: `tests/server/posts.test.ts`, `tests/server/auth.test.ts`

**Interfaces:**
- Consumes: `db` (Task 6); `*Response` types, `Listing`, `ValidationErrors`, `ApiErrorBody` (Task 7); `AUTH_COOKIE_NAME`, `AUTH_COOKIE_MAX_AGE_SECONDS` (Task 1).
- Produces: `postFormSchema`, `updatePostSchema`, `PostFormValues`, `POST_TITLE_MAX_LENGTH`, `POST_BODY_MAX_LENGTH` (`lib/validation/posts.ts`); `loginSchema`, `LoginFormValues` (`lib/validation/auth.ts`); HTTP contract below.

**HTTP contract** (all JSON, `snake_case`; errors are `ApiErrorBody`):

| Method & path | Auth | Success | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/posts?page&per_page&user_id` | — | 200 `Listing<PostResponse>` ordered by `id desc` | — (invalid numbers fall back to defaults 1 / 10; `per_page` ≤ 100) |
| `POST /api/v1/posts` body `{ post: { title, body } }` | session | 201 `PostDetailedResponse` | 401 `Sign in to continue`, 422 `Validation failed` + `errors` |
| `GET /api/v1/posts/:id` | — | 200 `PostDetailedResponse` | 404 `Post not found` (also for a non-numeric id) |
| `PATCH /api/v1/posts/:id` body `{ post: { title?, body? } }` | owner | 200 `PostDetailedResponse` | 401, 403 `You cannot change this post`, 404, 422 |
| `DELETE /api/v1/posts/:id` | owner | 200 `null` | 401, 403, 404 |
| `GET /api/v1/users/:id` | — | 200 `UserResponse` | 404 `User not found` |
| `POST /api/v1/auth/session` body `{ session: { email } }` | — | 201 `SessionResponse`, sets httpOnly cookie | 422 (invalid email), 401 `No account found for that email` |
| `GET /api/v1/auth/session` | session | 200 `SessionResponse` | 401, clears a stale cookie |
| `DELETE /api/v1/auth/session` | — | 200 `null`, deletes session + cookie | — |
| `GET /api/v1/me` | session | 200 `MeResponse` | 401, clears a stale cookie |

`permissions.update`/`destroy` are `true` only when the requesting session user owns the post. `UserResponse` never contains `email`; only `CurrentUserResponse` (me/session) does.

- [ ] **Step 1: Validation schemas.**

```ts
// lib/validation/posts.ts
import { z } from 'zod'

export const POST_TITLE_MAX_LENGTH = 200
export const POST_BODY_MAX_LENGTH = 5000

export const postFormSchema = z.object({
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

export const updatePostSchema = postFormSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one attribute')

export type PostFormValues = z.infer<typeof postFormSchema>
```

```ts
// lib/validation/auth.ts
import { z } from 'zod'

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .pipe(z.email('Enter a valid email address')),
})

export type LoginFormValues = z.infer<typeof loginSchema>
```

`bun add zod`. If zod 4's `.pipe(z.email(...))` behaves differently than expected, use `z.string().trim().min(1, …).email('Enter a valid email address')` and declare it.

- [ ] **Step 2: `server/http.ts`:**

```ts
import 'server-only'
import { NextResponse } from 'next/server'
import type { z } from 'zod'
import type { ApiErrorBody, Listing, ValidationErrors } from '@/types/api'

export const DEFAULT_PER_PAGE = 10
export const MAX_PER_PAGE = 100

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

export function fail(status: number, message: string, errors?: ValidationErrors) {
  const body: ApiErrorBody = errors ? { message, errors } : { message }
  return NextResponse.json(body, { status })
}

export function validationErrors(error: z.ZodError): ValidationErrors {
  const errors: ValidationErrors = {}
  for (const issue of error.issues) {
    const field = issue.path.join('.') || 'base'
    ;(errors[field] ??= []).push(issue.message)
  }
  return errors
}

export function invalid(error: z.ZodError) {
  return fail(422, 'Validation failed', validationErrors(error))
}

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function parsePagination(searchParams: URLSearchParams) {
  const page = positiveInt(searchParams.get('page'), 1)
  const perPage = Math.min(positiveInt(searchParams.get('per_page'), DEFAULT_PER_PAGE), MAX_PER_PAGE)
  return { page, perPage, skip: (page - 1) * perPage }
}

export function parseId(value: string): number | null {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function toListing<T>(list: T[], totalCount: number, page: number, perPage: number) {
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage))
  const listing: Listing<T> = {
    list,
    extra_data: {},
    limit_value: perPage,
    total_pages: totalPages,
    total_count: totalCount,
    current_page: page,
    next_page: page < totalPages ? page + 1 : null,
    prev_page: page > 1 ? page - 1 : null,
  }
  return listing
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
```

- [ ] **Step 3: `server/auth.ts`** (used only from Route Handlers, where cookies are writable):

```ts
import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { AUTH_COOKIE_MAX_AGE_SECONDS, AUTH_COOKIE_NAME } from '@/lib/constants-auth'
import { db } from './db'

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function startSession(userId: number) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + AUTH_COOKIE_MAX_AGE_SECONDS * 1000)
  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } })
  const store = await cookies()
  store.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
  return { expiresAt }
}

/** Returns the active session with its user; clears the cookie when it is stale. */
export async function getCurrentSession() {
  const store = await cookies()
  const token = store.get(AUTH_COOKIE_NAME)?.value
  if (!token) {
    return null
  }
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  })
  if (!session || session.expiresAt <= new Date()) {
    store.delete(AUTH_COOKIE_NAME)
    return null
  }
  return session
}

export async function endSession() {
  const store = await cookies()
  const token = store.get(AUTH_COOKIE_NAME)?.value
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } })
  }
  store.delete(AUTH_COOKIE_NAME)
}
```

- [ ] **Step 4: Serializers and repositories.** (Use the Prisma 8 generated model types for `User`/`Post`; import paths per Task 6.)

```ts
// server/serializers/user.ts
import 'server-only'
import type { CurrentUserResponse } from '@/services/MeService'
import type { UserResponse } from '@/services/UsersService'

export function serializeUser(user: User): UserResponse {
  return {
    id: user.id,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
    name: user.name,
    username: user.username,
    phone: user.phone,
    website: user.website,
  }
}

export function serializeCurrentUser(user: User): CurrentUserResponse {
  return { ...serializeUser(user), email: user.email }
}
```

```ts
// server/serializers/post.ts
import 'server-only'
import type { PostDetailedResponse, PostResponse } from '@/services/PostsService'
import { serializeUser } from './user'

export function serializePost(post: Post, viewerId: number | null): PostResponse {
  const isOwner = viewerId === post.userId
  return {
    id: post.id,
    created_at: post.createdAt.toISOString(),
    updated_at: post.updatedAt.toISOString(),
    permissions: { update: isOwner, destroy: isOwner },
    title: post.title,
    body: post.body,
    user_id: post.userId,
  }
}

export function serializePostDetailed(
  post: Post & { user: User },
  viewerId: number | null,
): PostDetailedResponse {
  return { ...serializePost(post, viewerId), user: serializeUser(post.user) }
}
```

```ts
// server/repositories/posts.ts
import 'server-only'
import { db } from '@/server/db'

export async function listPosts(options: { skip: number; take: number; userId?: number }) {
  const where = options.userId ? { userId: options.userId } : {}
  const [posts, totalCount] = await db.$transaction([
    db.post.findMany({ where, orderBy: { id: 'desc' }, skip: options.skip, take: options.take }),
    db.post.count({ where }),
  ])
  return { posts, totalCount }
}

export function findPost(id: number) {
  return db.post.findUnique({ where: { id }, include: { user: true } })
}

export function createPost(userId: number, data: { title: string; body: string }) {
  return db.post.create({ data: { ...data, userId }, include: { user: true } })
}

export function updatePost(id: number, data: { title?: string; body?: string }) {
  return db.post.update({ where: { id }, data, include: { user: true } })
}

export function deletePost(id: number) {
  return db.post.delete({ where: { id } })
}
```

```ts
// server/repositories/users.ts
import 'server-only'
import { db } from '@/server/db'

export function findUser(id: number) {
  return db.user.findUnique({ where: { id } })
}

export function findUserByEmail(email: string) {
  return db.user.findUnique({ where: { email: email.toLowerCase() } })
}
```

- [ ] **Step 5: Test helpers** `tests/server/helpers.ts`:

```ts
import { db } from '@/server/db'

export const cookieJar = new Map<string, string>()

export const cookieStore = {
  get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
  set: (name: string, value: string) => {
    cookieJar.set(name, value)
  },
  delete: (name: string) => {
    cookieJar.delete(name)
  },
}

export function assertTestDatabase() {
  if (!process.env.DATABASE_URL?.includes('next_template_test')) {
    throw new Error('Server tests must run against next_template_test')
  }
}

export async function resetDatabase() {
  assertTestDatabase()
  cookieJar.clear()
  await db.$executeRawUnsafe('TRUNCATE TABLE sessions, posts, users RESTART IDENTITY CASCADE')
}

export function createUser(overrides: Partial<{ name: string; username: string; email: string }>) {
  const suffix = Math.random().toString(36).slice(2, 8)
  return db.user.create({
    data: {
      name: overrides.name ?? `User ${suffix}`,
      username: overrides.username ?? `user_${suffix}`,
      email: overrides.email ?? `${suffix}@example.com`,
    },
  })
}

export function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) }
}
```

Each server test file starts with `// @vitest-environment node` and mocks `next/headers` through a hoisted reference:

```ts
const { cookieStore } = await vi.hoisted(async () => import('./helpers'))
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }))
```

If hoisted dynamic import is awkward, declare the jar inside `vi.hoisted(() => { … })` in each test file instead and export nothing cookie-related from helpers; declare the choice.

- [ ] **Step 6: Failing integration tests.** `tests/server/posts.test.ts` (signing in = `POST /api/v1/auth/session` handler with the user's email, which fills `cookieJar`):

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as signIn } from '@/app/api/v1/auth/session/route'
import { GET as listPosts, POST as createPost } from '@/app/api/v1/posts/route'
import { DELETE as deletePost, GET as getPost, PATCH as patchPost } from '@/app/api/v1/posts/[id]/route'
import { db } from '@/server/db'
import { createUser, jsonRequest, params, resetDatabase } from './helpers'

const { cookieStore } = await vi.hoisted(async () => import('./helpers'))
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }))

async function signInAs(email: string) {
  const response = await signIn(jsonRequest('/api/v1/auth/session', 'POST', { session: { email } }))
  expect(response.status).toBe(201)
}

describe('posts API', () => {
  beforeEach(resetDatabase)
  afterAll(() => db.$disconnect())

  it('lists posts newest first as a Listing', async () => {
    const user = await createUser({})
    for (const n of [1, 2, 3]) {
      await db.post.create({ data: { title: `Post ${n}`, body: 'Body', userId: user.id } })
    }
    const response = await listPosts(jsonRequest('/api/v1/posts?page=1&per_page=2', 'GET'))
    const listing = await response.json()
    expect(listing).toMatchObject({
      total_count: 3,
      total_pages: 2,
      current_page: 1,
      next_page: 2,
      prev_page: null,
      limit_value: 2,
    })
    expect(listing.list.map((post: { title: string }) => post.title)).toEqual(['Post 3', 'Post 2'])
    expect(listing.list[0].permissions).toEqual({ update: false, destroy: false })
  })

  it('requires a session to create', async () => {
    const response = await createPost(
      jsonRequest('/api/v1/posts', 'POST', { post: { title: 'T', body: 'B' } }),
    )
    expect(response.status).toBe(401)
  })

  it('rejects invalid posts with field errors', async () => {
    const user = await createUser({})
    await signInAs(user.email)
    const response = await createPost(
      jsonRequest('/api/v1/posts', 'POST', { post: { title: '  ', body: '' } }),
    )
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      message: 'Validation failed',
      errors: { title: ['Title is required'], body: ['Body is required'] },
    })
  })

  it('creates, updates, and deletes an owned post', async () => {
    const user = await createUser({})
    await signInAs(user.email)
    const created = await createPost(
      jsonRequest('/api/v1/posts', 'POST', { post: { title: ' Hello ', body: 'World' } }),
    )
    expect(created.status).toBe(201)
    const post = await created.json()
    expect(post).toMatchObject({ title: 'Hello', user_id: user.id, user: { id: user.id } })
    expect(post.permissions).toEqual({ update: true, destroy: true })
    expect(post.user).not.toHaveProperty('email')

    const id = String(post.id)
    const patched = await patchPost(
      jsonRequest(`/api/v1/posts/${id}`, 'PATCH', { post: { title: 'Renamed' } }),
      params({ id }),
    )
    expect(patched.status).toBe(200)
    expect(await patched.json()).toMatchObject({ title: 'Renamed', body: 'World' })

    const deleted = await deletePost(jsonRequest(`/api/v1/posts/${id}`, 'DELETE'), params({ id }))
    expect(deleted.status).toBe(200)
    const missing = await getPost(jsonRequest(`/api/v1/posts/${id}`, 'GET'), params({ id }))
    expect(missing.status).toBe(404)
  })

  it('forbids changing someone else’s post', async () => {
    const owner = await createUser({})
    const intruder = await createUser({})
    const post = await db.post.create({ data: { title: 'Mine', body: 'B', userId: owner.id } })
    await signInAs(intruder.email)
    const id = String(post.id)
    const response = await patchPost(
      jsonRequest(`/api/v1/posts/${id}`, 'PATCH', { post: { title: 'Hijacked' } }),
      params({ id }),
    )
    expect(response.status).toBe(403)
  })

  it('returns 404 for a non-numeric id', async () => {
    const response = await getPost(jsonRequest('/api/v1/posts/abc', 'GET'), params({ id: 'abc' }))
    expect(response.status).toBe(404)
  })
})
```

`tests/server/auth.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DELETE as signOut, GET as getSession, POST as signIn } from '@/app/api/v1/auth/session/route'
import { GET as getMe } from '@/app/api/v1/me/route'
import { AUTH_COOKIE_NAME } from '@/lib/constants-auth'
import { db } from '@/server/db'
import { cookieJar, createUser, jsonRequest, resetDatabase } from './helpers'

const { cookieStore } = await vi.hoisted(async () => import('./helpers'))
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }))

describe('session API', () => {
  beforeEach(resetDatabase)
  afterAll(() => db.$disconnect())

  it('rejects malformed and unknown emails', async () => {
    const malformed = await signIn(
      jsonRequest('/api/v1/auth/session', 'POST', { session: { email: 'nope' } }),
    )
    expect(malformed.status).toBe(422)
    const unknown = await signIn(
      jsonRequest('/api/v1/auth/session', 'POST', { session: { email: 'who@example.com' } }),
    )
    expect(unknown.status).toBe(401)
    expect(cookieJar.has(AUTH_COOKIE_NAME)).toBe(false)
  })

  it('signs in case-insensitively, exposes the profile, and signs out', async () => {
    const user = await createUser({ email: 'leanne@example.com' })
    const created = await signIn(
      jsonRequest('/api/v1/auth/session', 'POST', { session: { email: 'Leanne@Example.com' } }),
    )
    expect(created.status).toBe(201)
    expect(cookieJar.get(AUTH_COOKIE_NAME)).toBeTruthy()
    const stored = await db.session.findFirstOrThrow({ where: { userId: user.id } })
    expect(stored.tokenHash).not.toBe(cookieJar.get(AUTH_COOKIE_NAME))

    const me = await getMe(jsonRequest('/api/v1/me', 'GET'))
    expect(await me.json()).toMatchObject({ user: { id: user.id, email: 'leanne@example.com' } })

    const session = await getSession(jsonRequest('/api/v1/auth/session', 'GET'))
    expect(session.status).toBe(200)

    await signOut(jsonRequest('/api/v1/auth/session', 'DELETE'))
    expect(cookieJar.has(AUTH_COOKIE_NAME)).toBe(false)
    expect(await db.session.count()).toBe(0)
    expect((await getMe(jsonRequest('/api/v1/me', 'GET'))).status).toBe(401)
  })

  it('clears a stale cookie', async () => {
    cookieJar.set(AUTH_COOKIE_NAME, 'stale-token')
    const response = await getMe(jsonRequest('/api/v1/me', 'GET'))
    expect(response.status).toBe(401)
    expect(cookieJar.has(AUTH_COOKIE_NAME)).toBe(false)
  })
})
```

Run `bun run db:test:prepare && bun run test` → FAIL (handlers missing).

- [ ] **Step 7: Route Handlers.** Read `node_modules/next/dist/docs` on Route Handlers first (params are a Promise; use the `RouteContext<'/api/v1/posts/[id]'>` helper type if available). Shape for `app/api/v1/posts/[id]/route.ts`:

```ts
import { updatePostSchema } from '@/lib/validation/posts'
import { getCurrentSession } from '@/server/auth'
import { fail, invalid, ok, parseId, readJson } from '@/server/http'
import { deletePost, findPost, updatePost } from '@/server/repositories/posts'
import { serializePostDetailed } from '@/server/serializers/post'

type Context = { params: Promise<{ id: string }> }

async function loadOwnedPost(context: Context) {
  const id = parseId((await context.params).id)
  const post = id ? await findPost(id) : null
  if (!post) {
    return { error: fail(404, 'Post not found') } as const
  }
  const session = await getCurrentSession()
  if (!session) {
    return { error: fail(401, 'Sign in to continue') } as const
  }
  if (session.userId !== post.userId) {
    return { error: fail(403, 'You cannot change this post') } as const
  }
  return { post, session } as const
}

export async function GET(_request: Request, context: Context) {
  const id = parseId((await context.params).id)
  const post = id ? await findPost(id) : null
  if (!post) {
    return fail(404, 'Post not found')
  }
  const session = await getCurrentSession()
  return ok(serializePostDetailed(post, session?.userId ?? null))
}

export async function PATCH(request: Request, context: Context) {
  const result = await loadOwnedPost(context)
  if ('error' in result) {
    return result.error
  }
  const body = await readJson(request)
  const parsed = updatePostSchema.safeParse(body.post ?? {})
  if (!parsed.success) {
    return invalid(parsed.error)
  }
  const post = await updatePost(result.post.id, parsed.data)
  return ok(serializePostDetailed(post, result.session.userId))
}

export async function DELETE(_request: Request, context: Context) {
  const result = await loadOwnedPost(context)
  if ('error' in result) {
    return result.error
  }
  await deletePost(result.post.id)
  return ok(null)
}
```

Implement the remaining handlers to the HTTP contract the same way: `posts/route.ts` (`GET` via `parsePagination` + optional `user_id` through `parseId`, `serializePost` with the viewer id; `POST` → 401 without session, `postFormSchema.safeParse(body.post ?? {})`, `createPost`, 201), `users/[id]/route.ts`, `auth/session/route.ts` (`POST`: `loginSchema.safeParse(body.session ?? {})` → 422; `findUserByEmail` → 401; `startSession`; 201 `{ user: serializeCurrentUser(user), expires_at }`; `GET`: `getCurrentSession` → 401 or 200 with `expires_at: session.expiresAt.toISOString()`; `DELETE`: `endSession`, 200 `null`), `me/route.ts`. Every handler file sets `export const dynamic = 'force-dynamic'` only if the Next 16 docs say Route Handlers using `cookies()` need it (they normally do not — check and follow the docs).

- [ ] **Step 8: Verify.** Tests PASS; `bun run dev`, then `curl -s 'localhost:3000/api/v1/posts?per_page=2'` returns a Listing from the seeded dev DB; stop the server. lint/typecheck/format pass. Commit: `Task 8: Route Handlers with Prisma repositories and serializers`.

---

### Task 9: Presenters, user store, auth guard, and Posts pages

**Files:**
- Create: `presenters/User/UserPresenter.ts`, `presenters/Post/PostPresenter.ts`, `stores/user.ts`, `components/Auth/UserBootstrap/index.tsx`, `proxy.ts`, `components/Posts/Card/index.tsx` + `styles.module.scss`, `components/Posts/Grid/index.tsx` + `styles.module.scss`, `components/Posts/State/index.tsx` + `styles.module.scss`, `app/(site)/posts/page.tsx` + `styles.module.scss`, `app/(site)/posts/ssr/page.tsx`, `app/(site)/posts/csr/page.tsx` + `view.tsx`, `app/(site)/posts/[userId]/[id]/page.tsx` + `view.tsx` + `styles.module.scss`, `app/(site)/private/page.tsx` + `view.tsx` + `styles.module.scss`
- Modify: `app/providers.tsx` (`UserBootstrap`), `components/Layout/NavBar/index.tsx` (account area)
- Test: `tests/presenters/UserPresenter.test.ts`, `tests/presenters/PostPresenter.test.ts`, `tests/stores/user.test.ts`

**Interfaces:**
- Consumes: services and helpers from Task 7; repositories/serializers from Task 8.
- Produces: `UserPresenter` (`constructor(data: UserResponse)`, frontend props `initials: string`, `website_url: string | null`); `PostPresenter` (`constructor(data: PostResponse | PostDetailedResponse)`, frontend props `display_title: string`, `user?: UserPresenter`); `useUserStore` with state `profile`, `user`, `isUserLoading`, `hasLoadedProfile` and actions `setProfile`, `fetchProfile`, `createSession`, `logout` (all actions return the `ApiResponse`); `PostsCard({ post: PostPresenter, maxBodyChars?: number })`, `PostsGrid({ posts: PostPresenter[] })`, `PostsState({ title?, subtitle?, loading?, empty?, emptyMessage?, errorMessage?, onRetry?, children })`.

- [ ] **Step 1: Failing presenter tests.**

```ts
// tests/presenters/UserPresenter.test.ts
import { describe, expect, it } from 'vitest'
import { UserPresenter } from '@/presenters/User/UserPresenter'
import type { UserResponse } from '@/services/UsersService'

const user: UserResponse = {
  id: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  name: 'Leanne Graham',
  username: 'leanne',
  phone: null,
  website: 'hildegard.org',
}

describe('UserPresenter', () => {
  it('keeps backend fields and derives initials', () => {
    const presenter = new UserPresenter(user)
    expect(presenter.username).toBe('leanne')
    expect(presenter.initials).toBe('LG')
  })

  it('normalizes the website into a URL', () => {
    expect(new UserPresenter(user).website_url).toBe('https://hildegard.org')
    expect(new UserPresenter({ ...user, website: 'http://x.dev' }).website_url).toBe('http://x.dev')
    expect(new UserPresenter({ ...user, website: null }).website_url).toBeNull()
  })

  it('falls back to the username for initials', () => {
    expect(new UserPresenter({ ...user, name: '  ' }).initials).toBe('L')
  })
})
```

```ts
// tests/presenters/PostPresenter.test.ts
import { describe, expect, it } from 'vitest'
import { PostPresenter } from '@/presenters/Post/PostPresenter'
import { UserPresenter } from '@/presenters/User/UserPresenter'
import type { PostDetailedResponse } from '@/services/PostsService'

const post: PostDetailedResponse = {
  id: 9,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  permissions: { update: true, destroy: true },
  title: 'Hello',
  body: 'World',
  user_id: 1,
  user: {
    id: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    name: 'Leanne Graham',
    username: 'leanne',
    phone: null,
    website: null,
  },
}

describe('PostPresenter', () => {
  it('wraps the nested user in its presenter', () => {
    const presenter = new PostPresenter(post)
    expect(presenter.user).toBeInstanceOf(UserPresenter)
    expect(presenter.user?.initials).toBe('LG')
  })

  it('derives a display title', () => {
    expect(new PostPresenter(post).display_title).toBe('Hello')
    expect(new PostPresenter({ ...post, title: '   ' }).display_title).toBe('Untitled')
  })

  it('works without a nested user', () => {
    const { user: _user, ...plain } = post
    expect(new PostPresenter(plain).user).toBeUndefined()
  })
})
```

Run → FAIL.

- [ ] **Step 2: Presenters** (Revcube shape: declared backend fields, `// Frontend properties`, `Object.assign`, nested presenters). Add `getInitials` to `lib/utils.ts` (copy from the Nuxt template's `lib/utils.ts`).

```ts
// presenters/User/UserPresenter.ts
import { getInitials } from '@/lib/utils'
import type { UserResponse } from '@/services/UsersService'

export class UserPresenter {
  id!: number
  name!: string
  username!: string
  phone!: string | null
  website!: string | null
  created_at!: string
  updated_at!: string

  // Frontend properties
  initials!: string
  website_url!: string | null

  constructor(data: UserResponse) {
    Object.assign(this, data)

    this.initials = getInitials(this.name?.trim() || this.username || '')
    this.website_url = this.website
      ? /^https?:\/\//.test(this.website)
        ? this.website
        : `https://${this.website}`
      : null
  }
}
```

```ts
// presenters/Post/PostPresenter.ts
import { UserPresenter } from '@/presenters/User/UserPresenter'
import type { PostDetailedResponse, PostResponse } from '@/services/PostsService'
import type { Permissions } from '@/types/api'

export class PostPresenter {
  id!: number
  title!: string
  body!: string
  user_id!: number
  permissions!: Permissions
  created_at!: string
  updated_at!: string

  user?: UserPresenter

  // Frontend properties
  display_title!: string

  constructor(data: PostResponse | PostDetailedResponse) {
    Object.assign(this, data)

    if ('user' in data && data.user) {
      this.user = new UserPresenter(data.user)
    }

    this.display_title = this.title?.trim() || 'Untitled'
  }
}
```

Note: `Object.assign` copies `data.user` first; the explicit assignment then replaces it with a presenter. Without a user, `user` stays `undefined`.

- [ ] **Step 3: Failing store test** `tests/stores/user.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuthService from '@/services/AuthService'
import MeService from '@/services/MeService'
import { UserPresenter } from '@/presenters/User/UserPresenter'
import { useUserStore } from '@/stores/user'

const me = {
  user: {
    id: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    name: 'Leanne Graham',
    username: 'leanne',
    email: 'leanne@example.com',
    phone: null,
    website: null,
  },
}

describe('user store', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useUserStore.setState({ profile: null, user: null, isUserLoading: false, hasLoadedProfile: false })
  })

  it('loads the profile into a presenter', async () => {
    vi.spyOn(MeService, 'getProfile').mockResolvedValue({
      success: true,
      status: 200,
      message: 'ok',
      data: me,
    })
    await useUserStore.getState().fetchProfile()
    const state = useUserStore.getState()
    expect(state.user).toBeInstanceOf(UserPresenter)
    expect(state.profile?.user.email).toBe('leanne@example.com')
    expect(state.hasLoadedProfile).toBe(true)
    expect(state.isUserLoading).toBe(false)
  })

  it('clears the user on a 401 without toasting or throwing', async () => {
    vi.spyOn(MeService, 'getProfile').mockResolvedValue({
      success: false,
      status: 401,
      message: 'Sign in to continue',
      data: null,
    })
    const response = await useUserStore.getState().fetchProfile()
    expect(response.success).toBe(false)
    expect(useUserStore.getState().user).toBeNull()
  })

  it('treats an expired session as signed out on logout', async () => {
    useUserStore.getState().setProfile(me)
    vi.spyOn(AuthService, 'revokeSession').mockResolvedValue({
      success: false,
      status: 401,
      message: 'Sign in to continue',
      data: null,
    })
    const response = await useUserStore.getState().logout()
    expect(response.success).toBe(true)
    expect(useUserStore.getState().user).toBeNull()
  })
})
```

Run → FAIL.

- [ ] **Step 4: `stores/user.ts`** (`bun add zustand`):

```ts
import { create } from 'zustand'
import { sFetch } from '@/lib/apiCall'
import { UserPresenter } from '@/presenters/User/UserPresenter'
import AuthService, { type SessionResponse } from '@/services/AuthService'
import MeService, { type MeResponse } from '@/services/MeService'
import type { ApiResponse } from '@/types/api'

type UserState = {
  profile: MeResponse | null
  user: UserPresenter | null
  isUserLoading: boolean
  hasLoadedProfile: boolean
  setProfile: (profile: MeResponse | null) => void
  fetchProfile: () => Promise<ApiResponse<MeResponse>>
  createSession: (email: string) => Promise<ApiResponse<SessionResponse>>
  logout: () => Promise<ApiResponse<null>>
}

export const useUserStore = create<UserState>()((set, get) => {
  const quiet = {
    loading: (value: boolean) => set({ isUserLoading: value }),
    toast: false,
    throwOnError: false,
  }

  return {
    profile: null,
    user: null,
    isUserLoading: false,
    hasLoadedProfile: false,

    setProfile: (profile) =>
      set({ profile, user: profile ? new UserPresenter(profile.user) : null }),

    fetchProfile: async () => {
      const response = await sFetch(() => MeService.getProfile(), quiet)
      get().setProfile(response.success ? response.data : null)
      set({ hasLoadedProfile: true })
      return response
    },

    createSession: async (email) => {
      const response = await sFetch(() => AuthService.createSession(email), quiet)
      if (response.success && response.data) {
        get().setProfile({ user: response.data.user })
        set({ hasLoadedProfile: true })
      }
      return response
    },

    logout: async () => {
      const response = await sFetch(() => AuthService.revokeSession(), quiet)
      if (response.success || response.status === 401) {
        get().setProfile(null)
        return { ...response, success: true }
      }
      return response
    },
  }
})
```

- [ ] **Step 5: Bootstrap + NavBar account area.** `components/Auth/UserBootstrap/index.tsx` (`'use client'`, renders `null`): on mount, if `!hasLoadedProfile && !isUserLoading`, call `fetchProfile()`. Add it inside `Providers`. In `NavBar`'s `.accountArea`: while `!hasLoadedProfile` render nothing; with a user render `user.name` and an outline "Log out" button (`loading={isUserLoading}`) that calls `logout()`, then `router.refresh()` and `router.push(ROUTE_HOME)`, and toasts `response.message` on failure; without a user render a "Log in" button linking to `ROUTE_LOGIN`. Select store slices individually (`useUserStore((s) => s.user)`), never an object literal selector.

- [ ] **Step 6: `proxy.ts`** (read the Next 16 proxy docs first; export name and matcher syntax per docs):

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { AUTH_COOKIE_NAME } from '@/lib/constants-auth'
import { ROUTE_HOME, ROUTE_LOGIN, isPrivateRoute } from '@/lib/constants-routes'

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const hasSession = request.cookies.has(AUTH_COOKIE_NAME)

  if (!hasSession && isPrivateRoute(pathname)) {
    const url = new URL(ROUTE_LOGIN, request.url)
    url.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(url)
  }

  if (hasSession && pathname === ROUTE_LOGIN) {
    return NextResponse.redirect(new URL(ROUTE_HOME, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
```

The proxy only checks cookie presence (cheap, optimistic); Route Handlers validate the session, and a stale cookie is cleared by `/api/v1/me` on the first bootstrap call.

- [ ] **Step 7: Posts components** — port the Nuxt `components/Posts/{Card,Grid,State}` markup and SCSS:
  - `PostsCard` (no `'use client'`, no hooks): title `post.display_title`, `#id` pill, body truncated to `maxBodyChars` (default 160) with `…`, `next/link` "View" to `ROUTE_POST_DETAILS(post.user_id, post.id)`. Drop the Nuxt fake address line (it came from hard-coded presenter data).
  - `PostsGrid` (no hooks): grid of `PostsCard`, keyed by id.
  - `PostsState` (no hooks): header (title/subtitle), loading state (`Spinner` + "Loading…"), error state (message + a secondary "Retry" `Button` **only when** `onRetry` is passed), empty state, else children. Replace the Nuxt emoji with lucide icons (`TriangleAlert`, `Inbox`).

- [ ] **Step 8: Pages.**
  - `posts/page.tsx`: port Nuxt `pages/Posts` (two cards linking to SSR and CSR) plus a third card "Write a post" linking to `ROUTE_POST_NEW`. `metadata.title = 'Posts'`.
  - `posts/ssr/page.tsx` (Server Component): read the Next 16 docs on dynamic rendering; opt into request-time rendering (e.g. `await connection()` from `next/server`) so `next build` never queries the DB. Then `const { posts } = await listPosts({ skip: 0, take: 9 })`, map `serializePost(post, null)` → `new PostPresenter(...)`, render `PostsState` (title "Posts (SSR)", subtitle "Rendered on the server from Prisma", `empty` when none) wrapping `PostsGrid`, plus `PageHeader` actions linking to the CSR list and back. Presenters are created and consumed on the server here, which is allowed (no client boundary).
  - `posts/csr/view.tsx` (client): `const [page, setPage] = useState(1)`; `useApiData(queryKeys.posts({ page, per_page: 9 }), (signal) => PostsService.list({ page, per_page: 9 }, signal), { fallbackErrorMessage: 'Failed to load posts' })`; `useMemo` maps `data?.list` to presenters; `PostsState` (`onRetry={refresh}`) → `PostsGrid` + `Pagination` (`totalPages={data?.total_pages ?? 1}`).
  - `posts/[userId]/[id]/page.tsx` awaits `params`, passes numeric `id` to `view.tsx` (client): `useApiData(queryKeys.post(id), (signal) => PostsService.getById(id, signal), { toast: false })`; presenter via `useMemo`; renders two `Card`s ported from the Nuxt detail page (Post: title, body, ids; Author: name, username, website link from `website_url`, initials). Actions: Back (`ROUTE_POSTS`), Refresh (`refresh`), and "Edit" linking to `ROUTE_POST_EDIT(post.user_id, post.id)` only when `post.permissions.update`. If the URL `userId` does not match `post.user_id`, `router.replace` to the canonical URL.
  - `private/page.tsx` + `view.tsx`: heading "This page is private and requires authentication." (Nuxt copy); when the store has a profile, show name, username, email (from `profile.user.email`), and a "Log out" button; while loading show `Spinner`.

- [ ] **Step 9: Verify.** Tests PASS; `bun run build` passes; with `bun run dev`: `curl -s localhost:3000/posts/ssr | grep -c "/posts/"` > 0; `curl -sI localhost:3000/private` is a redirect to `/login?next=%2Fprivate`; stop the server. lint/typecheck/format pass. Commit: `Task 9: presenters, user store, proxy guard, and posts pages`.

---

### Task 10: Form handling (Revcube's newest flow in React)

**Files:**
- Create: `components/Posts/Form/index.tsx`, `components/Posts/Form/utils.ts`, `components/Posts/Form/styles.module.scss`, `components/Auth/LoginForm/index.tsx`, `components/Auth/LoginForm/styles.module.scss`, `app/(site)/posts/new/page.tsx` + `view.tsx`, `app/(site)/posts/[userId]/[id]/edit/page.tsx` + `view.tsx`, `app/(minimal)/login/page.tsx` + `view.tsx` + `styles.module.scss`
- Modify: `app/(site)/ui-kit/view.tsx` (add a "Forms" section rendering `PostForm` with a fake `onSubmit`)
- Test: `tests/components/Posts/utils.test.ts`, `tests/components/Posts/PostForm.test.tsx`, `tests/components/Auth/LoginForm.test.tsx`

**Interfaces:**
- Consumes: `postFormSchema`, `PostFormValues`, `loginSchema`, `LoginFormValues` (Task 8); `PostsService`, `PostResponse`, `PostAttributes` (Task 7); `useUserStore` (Task 9); `Input`/`Textarea` `error` prop and `Button` `loading` (Task 3).
- Produces: `EMPTY_POST_FORM`, `hydratePostForm(post)`, `buildPostAttributes(values, post)`, `isPostFormField(field)`; `PostForm({ post, submitLabel, onSubmit, onCancel? })` where `onSubmit: (values: PostFormValues) => Promise<ApiResponse<unknown>>`; `LoginForm({ onSubmit })` with the same `onSubmit` contract for `LoginFormValues`.

**Flow (from Revcube's `DealOverview/Overview` + `coreDetailsUtils.ts`):** the form component owns `useForm` + the Zod schema and validates; it hands validated values to the page; the page owns the request, cache invalidation, toasts, and navigation, and returns the `ApiResponse`; the form maps `errors` onto fields (or shows `message` as a form-level error). Hydrate/build helpers live in a `utils.ts` beside the form. Field markup stays explicit (no field-definition arrays, no FormField wrapper).

- [ ] **Step 1: Failing tests.**

```ts
// tests/components/Posts/utils.test.ts
import { describe, expect, it } from 'vitest'
import { buildPostAttributes, hydratePostForm, isPostFormField } from '@/components/Posts/Form/utils'
import type { PostResponse } from '@/services/PostsService'

const post = {
  id: 1,
  created_at: '',
  updated_at: '',
  permissions: { update: true, destroy: true },
  title: 'Hello',
  body: 'World',
  user_id: 1,
} satisfies PostResponse

describe('post form utils', () => {
  it('hydrates from a post or empty values', () => {
    expect(hydratePostForm(post)).toEqual({ title: 'Hello', body: 'World' })
    expect(hydratePostForm(null)).toEqual({ title: '', body: '' })
  })

  it('sends every field when creating', () => {
    expect(buildPostAttributes({ title: 'A', body: 'B' }, null)).toEqual({ title: 'A', body: 'B' })
  })

  it('sends only changed fields when updating', () => {
    expect(buildPostAttributes({ title: 'Hello', body: 'Changed' }, post)).toEqual({
      body: 'Changed',
    })
    expect(buildPostAttributes({ title: 'Hello', body: 'World' }, post)).toEqual({})
  })

  it('recognizes form fields', () => {
    expect(isPostFormField('title')).toBe(true)
    expect(isPostFormField('base')).toBe(false)
  })
})
```

```tsx
// tests/components/Posts/PostForm.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PostForm } from '@/components/Posts/Form'
import type { PostResponse } from '@/services/PostsService'

const success = { success: true, status: 200, message: 'ok', data: null }
const post = {
  id: 1,
  created_at: '',
  updated_at: '',
  permissions: { update: true, destroy: true },
  title: 'Hello',
  body: 'World',
  user_id: 1,
} satisfies PostResponse

describe('PostForm', () => {
  it('shows field errors and does not submit invalid values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(success)
    render(<PostForm post={null} submitLabel="Create post" onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create post' }))
    expect(await screen.findByText('Title is required')).toBeInTheDocument()
    expect(screen.getByText('Body is required')).toBeInTheDocument()
    expect(screen.getByLabelText(/Title/)).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits trimmed values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(success)
    render(<PostForm post={null} submitLabel="Create post" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Title/), '  Hello  ')
    await userEvent.type(screen.getByLabelText(/Body/), 'World')
    await userEvent.click(screen.getByRole('button', { name: 'Create post' }))
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Hello', body: 'World' })
  })

  it('maps server validation errors onto fields', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      success: false,
      status: 422,
      message: 'title: Title is taken',
      data: null,
      errors: { title: ['Title is taken'] },
    })
    render(<PostForm post={null} submitLabel="Create post" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Title/), 'Hello')
    await userEvent.type(screen.getByLabelText(/Body/), 'World')
    await userEvent.click(screen.getByRole('button', { name: 'Create post' }))
    expect(await screen.findByText('Title is taken')).toBeInTheDocument()
  })

  it('shows a form-level error when the server gives no field errors', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      success: false,
      status: 403,
      message: 'You cannot change this post',
      data: null,
    })
    render(<PostForm post={post} submitLabel="Save" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Body/), '!')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You cannot change this post')
  })

  it('keeps Save disabled until an existing post is changed', async () => {
    render(<PostForm post={post} submitLabel="Save" onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/Title/), '!')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })
})
```

```tsx
// tests/components/Auth/LoginForm.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LoginForm } from '@/components/Auth/LoginForm'

describe('LoginForm', () => {
  it('validates the email before submitting', async () => {
    const onSubmit = vi.fn()
    render(<LoginForm onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Email/), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the server message on failure', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      success: false,
      status: 401,
      message: 'No account found for that email',
      data: null,
    })
    render(<LoginForm onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Email/), 'who@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(onSubmit).toHaveBeenCalledWith({ email: 'who@example.com' })
    expect(await screen.findByRole('alert')).toHaveTextContent('No account found for that email')
  })
})
```

Run → FAIL.

- [ ] **Step 2: `components/Posts/Form/utils.ts`:**

```ts
import type { PostFormValues } from '@/lib/validation/posts'
import type { PostAttributes, PostResponse } from '@/services/PostsService'

export const EMPTY_POST_FORM: PostFormValues = { title: '', body: '' }

export function hydratePostForm(post: PostResponse | null): PostFormValues {
  return post ? { title: post.title, body: post.body } : { ...EMPTY_POST_FORM }
}

export function isPostFormField(field: string): field is keyof PostFormValues {
  return Object.hasOwn(EMPTY_POST_FORM, field)
}

export function buildPostAttributes(
  values: PostFormValues,
  post: PostResponse | null,
): PostAttributes {
  const original = hydratePostForm(post)
  const attributes: PostAttributes = {}
  for (const field of Object.keys(values) as (keyof PostFormValues)[]) {
    if (post === null || values[field] !== original[field]) {
      attributes[field] = values[field]
    }
  }
  return attributes
}
```

- [ ] **Step 3: `components/Posts/Form/index.tsx`** (`bun add react-hook-form @hookform/resolvers`):

```tsx
'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/SCN/button'
import { Input } from '@/components/SCN/input'
import { Textarea } from '@/components/SCN/textarea'
import { postFormSchema, type PostFormValues } from '@/lib/validation/posts'
import type { PostResponse } from '@/services/PostsService'
import type { ApiResponse } from '@/types/api'
import styles from './styles.module.scss'
import { hydratePostForm, isPostFormField } from './utils'

export type PostFormProps = {
  post: PostResponse | null
  submitLabel: string
  onSubmit: (values: PostFormValues) => Promise<ApiResponse<unknown>>
  onCancel?: () => void
}

export function PostForm({ post, submitLabel, onSubmit, onCancel }: PostFormProps) {
  const values = useMemo(() => hydratePostForm(post), [post])
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<PostFormValues>({ resolver: zodResolver(postFormSchema), values })

  const submit = handleSubmit(async (formValues) => {
    const response = await onSubmit(formValues)
    if (response.success) {
      return
    }
    const fieldErrors = Object.entries(response.errors ?? {}).filter(([field]) =>
      isPostFormField(field),
    )
    for (const [field, messages] of fieldErrors) {
      setError(field as keyof PostFormValues, { type: 'server', message: messages[0] })
    }
    if (fieldErrors.length === 0) {
      setError('root.server', { type: 'server', message: response.message })
    }
  })

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <Input label="Title" required error={errors.title?.message} {...register('title')} />
      <Textarea label="Body" required rows={8} error={errors.body?.message} {...register('body')} />
      {errors.root?.server && (
        <p className={styles.formError} role="alert">
          {errors.root.server.message}
        </p>
      )}
      <div className={styles.actions}>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={isSubmitting} disabled={post !== null && !isDirty}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
```

`styles.module.scss`: `.form` column flex with `gap: 1.25rem`; `.actions` right-aligned row with `gap: 0.75rem`; `.formError` `color: var(--color-danger)`, `font-size: 0.875rem`, `margin: 0`.

- [ ] **Step 4: `components/Auth/LoginForm/index.tsx`** — same structure: `useForm<LoginFormValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '' } })`; one `Input` (`label="Email"`, `type="email"`, `autoComplete="email"`, `required`, `error`); `onSubmit` failure → `errors.email` if `response.errors?.email`, else `root.server` alert; submit `Button` "Sign in" with `loading`. Below the form: muted hint "Dev login: try leanne@example.com (seeded user)."

- [ ] **Step 5: Pages.**
  - `posts/new/view.tsx` (client): `PageHeader` "Write a post"; `PostForm post={null} submitLabel="Create post" onCancel={() => router.push(ROUTE_POSTS)}`; `onSubmit` = `sFetch(() => PostsService.create(buildPostAttributes(values, null) as CreatePostAttributes), { toast: false, throwOnError: false })`; on success `toast.success('Post created')`, `queryClient.invalidateQueries({ queryKey: ['posts'] })`, `router.push(ROUTE_POST_DETAILS(data.user_id, data.id))`; return the response.
  - `posts/[userId]/[id]/edit/view.tsx` (client): load with `useApiData(queryKeys.post(id), …)`; show `PostsState` while loading/error; if `!post.permissions.update` render `Empty` "You cannot edit this post" with a link back; else `PostForm post={post} submitLabel="Save changes"`. `onSubmit`: `const attributes = buildPostAttributes(values, post)`; if empty → `toast('No changes to save')` and return a synthesized `{ success: true, status: 200, message: 'No changes', data: null }`; else `sFetch(() => PostsService.update(id, attributes), { toast: false, throwOnError: false })`; on success `queryClient.setQueryData(queryKeys.post(id), response.data)`, invalidate `['posts']`, `toast.success('Post updated')`, navigate to the detail page; return the response.
  - `login/page.tsx` (in `(minimal)`): `metadata.title = 'Log in'`; awaits `searchParams`, passes `nextPath = safeRedirectPath(typeof next === 'string' ? next : undefined)` to `view.tsx`; the view renders a centered `Card` with `LoginForm onSubmit={async ({ email }) => { const r = await createSession(email); if (r.success) { router.replace(nextPath); router.refresh() } return r }}`.

- [ ] **Step 6: UI kit.** Add a "Forms" section rendering `<PostForm post={null} submitLabel="Submit" onSubmit={async (values) => { toast.success(\`Submitted: ${values.title}\`); return { success: true, status: 200, message: 'ok', data: null } }} />`.

- [ ] **Step 7: Verify.** Tests PASS; `bun run build` passes; manual dev check with curl: `POST /api/v1/auth/session` with `leanne@example.com` using a cookie jar (`curl -c jar -b jar`), then `POST /api/v1/posts` creates a post (201) and `GET /posts/new` with the jar returns 200 while without the jar it redirects to `/login?next=%2Fposts%2Fnew`. lint/typecheck/format pass. Commit: `Task 10: form handling with React Hook Form and Zod`.

---

### Task 11: Documentation and final verification

**Files:**
- Modify: `README.md`, `docs/DECISIONS.md` (only to reflect fallbacks actually taken), `AGENTS.md` (only if a rule needs a path fix)

- [ ] **Step 1: README.** Replace the create-next-app README with: title "Next Template"; stack list; **Setup** (`bun install`, copy `.env.example` → `.env` and `.env.test.example` → `.env.test`, `docker compose up -d db` *or* a local PostgreSQL, `bun run db:migrate`, `bun run db:seed`, `bun run dev`, dev login `leanne@example.com`); **Scripts** table (every `package.json` script, one line each); **Testing** (`bun run db:test:prepare` once per schema change, then `bun run test`); **Architecture** with the request flow diagram below and one paragraph per layer (SCN/styling, services + `ApiResponse`, `sFetch`/`sData`/`mFetch`/`mData` with the option table ported from the Nuxt `lib/apiCall-ReadMe.md`, `useApiData` + `queryKeys`, presenters, stores, Route Handlers/repositories/serializers, forms, auth); **Adding a resource** checklist (Prisma model → migration → repository → serializer → `*Service` + types → Route Handlers + tests → presenter → page/form); link to `docs/DECISIONS.md` and `AGENTS.md`.

```
Client view ──useApiData / sFetch──▶ XService (API, axios) ──HTTP──▶ app/api/v1 Route Handler
     ▲                                                                   │ zod validate
     │ presenter (new XPresenter(response))                              ▼
     └──────────────── ApiResponse<XResponse> ◀── serializer ◀── repository (Prisma) ──▶ PostgreSQL

Server page ──▶ repository ──▶ serializer ──▶ presenter ──▶ server-rendered components
```

- [ ] **Step 2: Full verification**, all from a clean state, recording output in the report:

```bash
bun install
bun run format:check
bun run lint
bun run typecheck
bun run db:test:prepare
bun run test
bun run build
```

Then `bun run start` and check: `/` 200, `/posts` 200, `/posts/ssr` 200 with seeded titles, `/posts/csr` 200, `/ui-kit` 200, `/private` redirects to `/login?next=%2Fprivate`, `/does-not-exist` returns the not-found page (status per Next behavior for private-matched unknown paths: redirect to login is expected), `GET /api/v1/posts` returns a Listing. Stop the server.

- [ ] **Step 3: Tailwind boundary check.** `grep -rnE "className=\"[^\"]*\b(flex|grid|p[xy]?-|m[xy]?-|text-|bg-|rounded|gap-|w-|h-)" app components --include=*.tsx | grep -v "components/SCN"` → no matches. `grep -rn "style={{" app components --include=*.tsx | grep -v components/SCN` → no matches.

- [ ] **Step 4: Commit.** `Task 11: documentation and final verification`.
