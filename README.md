# Next Template

A reusable Next.js baseline: App Router, a typed client API layer with presenters, Route Handlers
backed by Prisma and PostgreSQL, schema-first forms, and shadcn/ui with SCSS everywhere else.

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript 5.9
- Bun as the package manager (scripts run on Node 24)
- SCSS CSS Modules for all styling; shadcn/ui (Radix) + Tailwind CSS 4 only inside `components/SCN`
- lucide-react icons, sonner toasts
- axios service layer, TanStack Query 5, Zustand 5
- React Hook Form 7 + `@hookform/resolvers` + Zod 4
- Prisma ORM 8 (pinned release candidate) + PostgreSQL 16
- Vitest + Testing Library + jsdom

## Setup

```bash
bun install
cp .env.example .env
cp .env.test.example .env.test
docker compose up -d db          # or use a local PostgreSQL >= 15 and edit DATABASE_URL
bun run db:migrate               # emit the contract, plan and apply migrations
bun run db:seed                  # 3 users, 12 posts
bun run dev
```

Open http://localhost:3000. The dev login is a plain email (no password): `leanne@example.com`,
`ervin@example.com` or `clementine@example.com`. Replace this with real authentication before
production.

If you use a local PostgreSQL instead of Docker, create the `next_template_dev` and
`next_template_test` databases and put the matching URLs in `.env` and `.env.test`.

## Scripts

| Script                    | What it does                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `bun run dev`             | Next dev server (Turbopack).                                                        |
| `bun run build`           | Production build.                                                                   |
| `bun run start`           | Serve the production build.                                                         |
| `bun run lint`            | ESLint.                                                                             |
| `bun run format`          | Prettier, write.                                                                    |
| `bun run format:check`    | Prettier, check only.                                                               |
| `bun run typecheck`       | `next typegen` then `tsc --noEmit`.                                                 |
| `bun run test`            | Vitest, single run.                                                                 |
| `bun run test:watch`      | Vitest in watch mode.                                                               |
| `bun run contract:emit`   | Re-emit `prisma/contract.json` and `prisma/contract.d.ts` from `contract.prisma`.   |
| `bun run db:migrate`      | Emit the contract, plan a migration, apply it to the dev DB and advance the db ref. |
| `bun run db:deploy`       | Apply pending migrations non-interactively (CI / production).                       |
| `bun run db:seed`         | Idempotent seed script (`prisma/seed.ts`) for the dev DB.                           |
| `bun run db:studio`       | Print the database schema tree (`prisma db schema`; Prisma 8 has no Studio).        |
| `bun run db:test:prepare` | Reset and migrate `next_template_test` (refuses any other database).                |

## Testing

Run `bun run db:test:prepare` once per schema change (and whenever the test DB may be dirty), then
`bun run test`. Server tests call the Route Handlers directly against `next_template_test` and never
touch the dev database. Component, store, presenter and service tests need no database.

## Architecture

```
Client view ──useApiData / sFetch──▶ XService (API, axios) ──HTTP──▶ app/api/v1 Route Handler
     ▲                                                                   │ zod validate
     │ presenter (new XPresenter(response))                              ▼
     └──────────────── ApiResponse<XResponse> ◀── serializer ◀── repository (Prisma) ──▶ PostgreSQL

Server page ──▶ repository ──▶ serializer ──▶ presenter ──▶ server-rendered components
```

**Styling and `components/SCN`.** Design tokens live in `styles/palette.scss` and
`styles/variables.scss` and are emitted as CSS variables. Every component outside `components/SCN`
uses a semantic class in a co-located `styles.module.scss`; Tailwind utilities, directives and
`@apply` are allowed only in `components/SCN`, where the shadcn components live in a flat layout so
`shadcn add` keeps working. Callers never pass `className` or `style` to reusable components. Form
controls own their `label`, `required` and `error` props. Read `AGENTS.md` for the full rules.

**Services and `ApiResponse`.** `services/*Service.ts` (PascalCase, default-exported classes) extend
the static `API` class in `services/api.ts`. Every method resolves to `ApiResponse<T>` (`success`,
`status`, `message`, `data`, optional `errors` keyed by field); they do not throw and do not toast.
`*Response`, `*Attributes` and `*ListParams` types live next to their service.

**`sFetch` / `sData` / `mFetch` / `mData`.** `lib/apiCall.ts` standardizes loading toggling, toast
errors and throwing:

- `sFetch(request, options)`: one request, returns the full `ApiResponse`.
- `sData(request, options)`: one request, returns `response.data`, always throws on failure.
- `mFetch([...requests], options)`: parallel requests, returns the full `ApiResponse` tuple.
- `mData([...requests], options)`: parallel requests, returns the `data` tuple, throws if any fails.

| Option                 | Applies to | Default          | Meaning                                                              |
| ---------------------- | ---------- | ---------------- | -------------------------------------------------------------------- |
| `loading`              | all        | none             | Setter called with `true` then `false`, e.g. `setIsLoading`.         |
| `toast`                | all        | `true`           | Show the resolved error message as a toast.                          |
| `toastColor`           | all        | `'destructive'`  | `'default'`, `'destructive'` or `'success'`.                         |
| `fallbackErrorMessage` | all        | `Request failed` | Message when the response carries none.                              |
| `overrideErrorMessage` | all        | none             | Always shown instead of the response message.                        |
| `throwOnError`         | `*Fetch`   | `true`           | Throw on failure; `false` returns `{ success: false, ... }` instead. |
| `toastMode`            | `m*`       | `'each'`         | `'each'`, `'first'` or `'none'` for batches.                         |

`sData` and `mData` always throw; use `sFetch` with `toast: false, throwOnError: false` when a form
page needs to inspect field errors itself.

**`useApiData` and `queryKeys`.** `hooks/useApiData` wraps TanStack Query around `sData` and returns
`{ data, isLoading, error, errorMessage, hasData, refresh }`. Query keys come from
`lib/queryKeys.ts` so mutations can invalidate by prefix (`['posts']`). The client defaults to
`retry: false` and no refetch on window focus (`app/providers.tsx`).

**Presenters.** `presenters/<Domain>/<Name>Presenter.ts` are view models (`Object.assign` of the
response plus derived frontend properties and nested presenters). They are built where the data is
consumed: in a store setter, a client view or a server page. They never cross the Server to Client
boundary, so pass `*Response` objects to client components and construct inside them.

**Stores.** Zustand (`stores/user.ts`) holds the signed-in profile and a `UserPresenter`.
`UserBootstrap` loads the profile once. Select state per slice (`useUserStore((s) => s.user)`),
never with an object-literal selector.

**Route Handlers, repositories, serializers.** `app/api/v1/**/route.ts` stay thin: validate with Zod
(`lib/validation/*`), call a repository in `server/repositories`, serialize rows into the same
`*Response` types the services declare (`server/serializers`). JSON keys are `snake_case`; Prisma
fields are `camelCase` with `@map`. Server Components call repositories and serializers directly,
never their own HTTP API. The Prisma 8 setup is contract-first: `prisma/contract.prisma` is the
source, `prisma/contract.json` and `prisma/contract.d.ts` are emitted and committed, queries run
through `db.orm.public.<Model>` (`server/db.ts`), and timestamps come back as Postgres text (convert
with `toIsoString` from `server/models.ts`). Close the client with `db.close()`. `package.json`
pins `@prisma/orm-toolchain` through `overrides` so the CLI and the runtime package agree on the
contract format; revisit the pin when bumping Prisma.

**Forms.** The form component owns `useForm` and the Zod schema and validates; it hands validated
values to the page. The page owns the request (`sFetch` with `toast: false, throwOnError: false`),
cache invalidation, toasts and navigation, and returns the `ApiResponse`; the form maps `errors`
onto fields or shows `message` as a form-level alert. Hydrate/build helpers sit in a `utils.ts` next
to the form (`components/Posts/Form`).

**Auth.** A dev-only email login (`POST /api/v1/auth/session`) creates a hashed-token session and
sets an httpOnly cookie (`Uauth`). `proxy.ts` redirects private routes to `/login?next=...` when the
cookie is absent (unknown paths count as private) and sends signed-in users away from `/login`. It
only checks cookie presence; Route Handlers validate the session, and a stale cookie is cleared by
the first `/api/v1/me` call.

## Adding a resource

1. Add the model to `prisma/contract.prisma` (camelCase fields with snake_case `@map`s, text
   timestamps as `TimestamptzString`) and run `bun run db:migrate`.
2. Add a repository in `server/repositories/<name>.ts` using `db.orm.public.<Model>`; export row
   types from `server/models.ts` if needed.
3. Add a serializer in `server/serializers/<name>.ts` that maps a row to the `*Response` contract
   (ISO timestamps, `snake_case` keys, `permissions`).
4. Add `services/<Name>Service.ts` (default-exported class extending `API`) with its `*Response`,
   `*Attributes` and `*ListParams` types, plus keys in `lib/queryKeys.ts`.
5. Add Zod schemas in `lib/validation/<name>.ts` and the Route Handlers under
   `app/api/v1/<name>/`, with tests in `tests/server/` against the test DB.
6. Add a presenter in `presenters/<Name>/<Name>Presenter.ts`.
7. Add the pages (`page.tsx` + `view.tsx`), the form component and routes in
   `lib/constants-routes.ts` (decide whether they are public or private).

## More

- [`docs/DECISIONS.md`](docs/DECISIONS.md): what was chosen over the Nuxt/Revcube setup and why.
- [`AGENTS.md`](AGENTS.md): project conventions and rules for contributors and agents.
