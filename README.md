# Next Template

A reusable Next.js baseline: App Router, a server-only Data Access Layer on Prisma and PostgreSQL, Better
Auth, Server Actions for writes, shared Zod DTOs, schema-first forms, and shadcn/ui with SCSS everywhere else.

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript 5.9
- Bun as the package manager (scripts run on Node 24)
- SCSS CSS Modules for all styling; shadcn/ui (Radix) + Tailwind CSS 4 only inside `components/SCN`
- lucide-react icons, sonner toasts
- Prisma ORM 7.10 (`prisma-client` generator, `@prisma/adapter-pg`) + PostgreSQL 16
- Better Auth 1.7 (email + password, official Prisma adapter)
- Server Actions + Zod 4 DTOs; React Hook Form 7 + `@hookform/resolvers`
- Vitest + Testing Library + jsdom

## Setup

```bash
cp .env.example .env              # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
cp .env.test.example .env.test    # same for the test database
docker compose up -d db           # or use a local PostgreSQL >= 15 and edit DATABASE_URL
bun install                       # also generates the Prisma client (postinstall)
bun run db:deploy                 # apply migrations
bun run db:seed                   # 4 users, 16 posts
bun run dev
```

Open http://localhost:3000 and log in as `leanne@example.com` / `password123` (admin:
`admin@example.com` / `password123`), or create an account at `/signup`.

If you use a local PostgreSQL instead of Docker, create the `next_template_dev` and
`next_template_test` databases and put the matching URLs in `.env` and `.env.test`.

**Existing checkouts:** the dev database from before the Prisma 7 / Better Auth refactor holds the
old Prisma 8 schema. Run `bun run db:reset` once; it drops, re-migrates, and re-seeds the dev
database (it destroys that data).

## Scripts

| Script                    | What it does                                                           |
| ------------------------- | ---------------------------------------------------------------------- |
| `bun run dev`             | Next dev server (Turbopack).                                           |
| `bun run build`           | Production build.                                                      |
| `bun run start`           | Serve the production build.                                            |
| `bun run lint`            | ESLint.                                                                |
| `bun run format`          | Prettier, write.                                                       |
| `bun run format:check`    | Prettier, check only.                                                  |
| `bun run typecheck`       | `prisma generate`, `next typegen`, then `tsc --noEmit`.                |
| `bun run test`            | Vitest, single run.                                                    |
| `bun run test:watch`      | Vitest in watch mode.                                                  |
| `bun run db:generate`     | Regenerate the Prisma client into `generated/` (also runs on install). |
| `bun run db:migrate`      | Create and apply a migration to the dev DB, then regenerate.           |
| `bun run db:deploy`       | Apply pending migrations only (CI / production).                       |
| `bun run db:seed`         | Seed the dev DB (`prisma/seed.ts`, replaces the seeded users).         |
| `bun run db:reset`        | Drop, re-migrate, and re-seed the dev DB.                              |
| `bun run db:studio`       | Prisma Studio.                                                         |
| `bun run db:test:prepare` | Reset and migrate the database in `.env.test`.                         |

## Testing

Copy `.env.test.example` to `.env.test`, run `bun run db:test:prepare` once per schema change (and
whenever the test DB may be dirty), then `bun run test`. Server tests call the DAL, Server Actions, and
Route Handler directly against `next_template_test` and never touch the dev database. Component,
presenter, and DTO tests need no database.

## Architecture

```
prisma/schema.prisma ──prisma generate──▶ generated/prisma (git-ignored)

lib/dto/*  Zod schemas: inputs and outputs, types via z.infer (client- and server-safe)
lib/data/* server-only DAL: the only code that touches Prisma; enforces auth; returns DTOs

Server Component ───────────────────────────────────────────▶ lib/data ──▶ PostgreSQL
Server Action (actions/*)  parseInput(lib/dto) ─────────────▶ lib/data
Client facade (lib/client) ─fetch─▶ Route Handler (app/api/v1) ▶ lib/data   (parsed with lib/dto)
```

**Styling and `components/SCN`.** `styles/global.css` contains the official shadcn neutral theme,
light/dark tokens, and Tailwind base styles. Application CSS Modules use those tokens directly.
`components/SCN` holds stock CLI-generated primitives, with no local styling or API overrides.
Forms use `components/Form/Input` and `components/Form/Textarea` for labels and errors;
`LoadingButton` composes the stock Button and Spinner. Callers do not pass `className` or `style`
to application components. Read `AGENTS.md` for the full rules.

The theme menu in navigation offers light, dark, and system preferences. `next-themes` defaults to
system, saves the selection, and updates the stock Toaster too. The `/ui-kit` catalog exercises
the components and theme selector.

Add or reinstall primitives using the official CLI:

```bash
bunx shadcn@latest add button input textarea --overwrite --yes
```

Keep `lib/utils.ts` dedicated to the CLI's `cn` utility; put application helpers in separate files.
Official references: [CLI](https://ui.shadcn.com/docs/cli),
[theming](https://ui.shadcn.com/docs/theming), and
[Next.js dark mode](https://ui.shadcn.com/docs/dark-mode/next).

**DTOs.** `lib/dto` holds Zod schemas for inputs (`createPostInput`, `signUpInput`) and outputs
(`postSummarySchema`, `postDetailSchema`); `z.infer` gives the types. Output schemas use
`z.coerce.date()`, so a client parsing JSON gets `Date` back. Lists are `Page<T>`.

**Data Access Layer.** `lib/data/*` is `server-only` and the only code that imports Prisma (ESLint
enforces it). Each function selects exactly the columns its DTO needs, maps the row to the DTO, and
enforces auth itself with `requireUser()` / `requireAdmin()` plus record-level rules (a post may be
changed by its author or an admin).

**Server Actions.** Writes live in `actions/`: validate with `parseInput`, call the DAL,
`revalidatePath` / `refresh`, and return an `ActionResult<T>`. Forms map failures onto fields with
`applyActionErrors`.

**Route Handler and facade.** `GET /api/v1/posts` exists only because a client component must fetch
(`/posts/csr`). `lib/client/posts.ts` calls it and parses the response with the shared schema.

**Errors.** The DAL throws `UnauthorizedError`, `ForbiddenError`, `NotFoundError` and
`ValidationError`. Actions turn them into `ActionResult` failures, the Route Handler into
401/403/404/422 JSON, and `loadPage` into a login redirect or `notFound()`.

**Presenters.** Types are the source of truth; presenters exist only for overrides. A presenter is
a plain function that spreads the DTO and replaces just the fields a view needs reshaped
(`presentUser` turns a bare `website` domain into a linkable URL). Apply it where the data is
consumed, such as a view's `useMemo`.

**Auth.** Better Auth with email + password, database sessions, and the `nextCookies` plugin. `role`
(`user` / `admin`) is an additional user field. `proxy.ts` redirects private routes to
`/login?next=...` when the session cookie is absent (unknown paths count as private); it only
checks cookie presence, so the `/login` and `/signup` pages redirect signed-in users themselves (a
stale cookie must not lock anyone out). The DAL does the real check on every read and write.

Better Auth's HTTP routes `/api/auth/sign-up/email` and `/api/auth/update-user` are disabled
(`disabledPaths`): they would bypass our validation. Sign-up goes through `signUpAction`; sign-in and
sign-up actions are rate limited in production (in memory, per process).

Sessions last 7 days and refresh only through Server Actions or the auth route (Server Components
cannot set cookies), so a user who only browses is signed out when the session expires.

## Design decisions

- **One contract.** Three paths (Server Component, Server Action, client facade → Route Handler)
  end at the same DAL function and return the same DTO type under the same auth rules.
- **DAL and DTO boundary.** Prisma rows never leave `lib/data`; callers only see Zod-defined DTOs, and
  the DAL's `select` plus mapping make schema drift a compile error.
- **Auth in the DAL.** A page, action, or proxy that forgets a check cannot bypass authorization,
  because the data functions enforce it themselves.
- **Server Actions vs Route Handlers.** Actions for UI writes (no extra HTTP surface to design);
  a Route Handler only where a client has to fetch.
- **Typed errors per caller.** One set of error classes, translated once per transport.

## What I'd do at scale

- Declarative authorization policies instead of inline checks.
- ZenStack or Postgres row-level security as a second enforcement layer.
- Extend the existing lint rule to restrict `better-auth` imports as well.
- Rate limiting is per-process memory today; use Redis or Better Auth's database rate-limit storage so
  the limits hold across instances.
- Cursor pagination (`CursorPage<T> = { items, nextCursor }`) for feeds.
- Generate OpenAPI from the Zod schemas if external API consumers appear.

## Adding a resource

1. Add the model to `prisma/schema.prisma` (camelCase fields with snake_case `@map`s) and run
   `bun run db:migrate`.
2. Add the Zod schemas to `lib/dto/<name>.ts` (inputs and the output variants a view needs).
3. Add the DAL in `lib/data/<name>.ts`: `import 'server-only'`, select exactly the DTO columns, map
   rows to DTOs, call `requireUser()` / `requireAdmin()` and enforce record-level rules, throw typed
   errors.
4. Add Server Actions in `actions/<name>.ts` (`parseInput` → DAL → `revalidatePath` →
   `ActionResult`). Add a Route Handler under `app/api/v1/<name>/` plus a facade in `lib/client`
   only if a client component must fetch.
5. Only if a view needs reshaped fields, add `presentX` in `presenters/<Name>Presenter.ts`.
6. Add the pages (`page.tsx` + `view.tsx`), the form component, and routes in
   `lib/constants-routes.ts` (decide whether they are public or private). Wrap page reads in
   `loadPage`.
7. Add tests in `tests/lib/data/`, `tests/actions/` (and `tests/app/` or `tests/lib/client/` for a
   handler) against the test DB.

## More

- [`docs/DECISIONS.md`](docs/DECISIONS.md): what was chosen over the Nuxt/Revcube setup and why.
- [`AGENTS.md`](AGENTS.md): project conventions and rules for contributors and agents.
