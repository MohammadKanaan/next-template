# Handoff: data architecture decisions (2026-10-05)

Read this first in the next session. It records what was decided about the data layer, what is
still open, and the exact state of the repo. Nothing below has been implemented yet unless the
"Repo state" section says so.

## Repo state

- Repo: `/Users/abdoachkar/programming/next-template`. `master` is the untouched
  `create-next-app` commit; work is on `feat/baseline` (HEAD `27e41ce`, 11 task commits plus the
  plan). Not merged.
- **Uncommitted on `feat/baseline`** (33 paths, all checks green: format, lint, typecheck,
  59/59 tests, build):
  - `AGENTS.md` rewritten from `/Users/abdoachkar/programming/archer-frontend-nuxt3/AGENTS.md`,
    translated to Next/React. The `nextjs-agent-rules` block at the top stays (`next dev` re-adds
    it; opt-out is `agentRules: false` in `next.config.ts`, which we chose not to use).
  - Class presenters removed; archer-style `presentUser` override function added.
  - DTOs derived from Prisma models (`types/models.ts`) and API JSON switched to camelCase.
  - `docs/DECISIONS.md` and `README.md` updated for the above.
  - Decide whether to commit this as an intermediate step or fold it into the refactor below.
    Parts of it (Prisma-derived DTOs, `AGENTS.md` data-layer sections) are superseded by the
    decisions here.
- The final adversarial review of `feat/baseline` was stopped before it reported; the branch has
  had no independent review. Known gaps are listed under "Carried-over issues".
- Current architecture, for contrast: browser → axios `services/*Service.ts` → Route Handlers
  `app/api/v1/**` → `server/repositories` + `server/serializers` → Prisma 8. TanStack Query on
  client views, Zustand user store, hand-rolled DB sessions.

## Decided

1. **Shared DTOs in `lib/dto/`.** Zod schemas are the single source of truth for both runtime
   validation and TypeScript types (`z.infer`). No Prisma imports, so client and server can use
   them. Use `z.coerce.date()` for dates that cross JSON.
   - This **replaces** "DTOs derived from the generated Prisma types". Drift from the database is
     caught at compile time where the DAL maps Prisma results into the DTO types.
   - Input schemas (`createPostInput`, `updatePostInput`, login input) live in `lib/dto/` next to
     the output DTOs. `lib/validation/` goes away. React Hook Form validates with them on the
     client; actions re-validate on the server.
2. **Data access layer in `lib/data/`, marked `server-only`.** The only code that touches Prisma.
   Queries use `select` for exactly the columns a DTO needs; results are mapped to DTOs (convert
   Postgres text timestamps, `Decimal`, etc.). `server/` moves here (`db`, auth helpers, one module
   per resource). Lint should block Prisma imports outside it.
3. **Auth checks inside the DAL.** `requireUser()` (wrapped in React `cache()`) and
   `requireAdmin()` are called at the top of DAL functions; record-level rules ("owner or admin")
   are written inline. The user's role is available through the session. `proxy.ts` stays for
   optimistic redirects only, never real security.
4. **Reads.** Server Components call the DAL directly and pass DTOs to Client Components as props.
   No HTTP round trip to our own Route Handlers.
5. **Writes.** Server Actions validate input with plain Zod `safeParse` (not next-safe-action), then
   call the DAL. Accepted costs: actions break across deploys (build-specific IDs), are POST-only
   and sequential, and are not callable by non-UI clients. Mitigated because auth lives in the DAL,
   so an action that forgets a check still cannot bypass it.
6. **Client-side fetching only when genuinely needed.** A Route Handler calls the DAL and maps
   errors to status codes; a small client facade fetches it and parses the response with the same
   Zod schema. Route Handlers exist only for these cases (and future external consumers).
7. **One contract across every path.** Server Component → DAL, Server Action → DAL, and client
   facade → Route Handler → DAL all end at the same DAL function and return the same DTO type with
   the same auth rules. Server paths rely on TypeScript types (the DAL does not re-parse its own
   output); the client facade gets the runtime guarantee by parsing with the shared schema, which
   also turns ISO strings back into `Date`.
8. **Error strategy.** The DAL throws typed errors: `UnauthorizedError`, `ForbiddenError`,
   `NotFoundError`, `ValidationError`. Each caller translates them:
   - Server Actions catch and return `{ ok: false, code, message, fieldErrors? }`; success is
     `{ ok: true, data }`. Forms already map `fieldErrors` onto fields.
   - Route Handlers map to 401 / 403 / 404 / 422.
   - Server Components: `requireUser()` redirects to login; missing records call `notFound()`.
9. **DTO variants per operation.** Each operation returns the variant it needs, shaped at the query
   with `select`: e.g. `PostSummary` (list: id, title, createdAt, server-computed `excerpt`, light
   `author`) and `PostDetail` (full body, author, permissions). Keep the set small and fixed per
   resource; no per-caller shapes or `?fields=` parameters.
10. **Pagination wrappers.** One generic `Page<T> = { items, page, perPage, totalItems, totalPages }`
    for numbered pages, optionally `Page<T, Meta>` for typed list metadata; `CursorPage<T> =
{ items, nextCursor }` for feeds if ever needed. Replaces the current `Listing` (drop
    `nextPage`/`prevPage`/`limitValue`/`extraData`).
11. **Presenters** stay archer-style: plain `presentX(dto) => ({ ...dto, overrides })` functions,
    frontend-only, only when a view needs reshaped data. Backend shaping is the DAL's mapping, not
    a "presenter".
12. **Admin example.** Add a `role` column to `User`; seed one admin. Editing and deleting posts is
    allowed for "owner or admin". No admin UI.
13. **Removed:** TanStack Query and `hooks/useApiData` / `lib/queryKeys` (no current need), the
    axios `services/` layer and `lib/apiCall`, `server/repositories` + `server/serializers`
    (merged into the DAL), and most of `app/api/v1` (keep only routes a client facade actually
    fetches; none may be needed initially). The Zustand user store and `UserBootstrap` are likely
    unnecessary once the layout reads the current user on the server — confirm during planning.
14. **README** gets a "Design decisions" section on the DAL/DTO boundary and a "What I'd do at
    scale" section: declarative policies, ZenStack or Postgres RLS, and a lint rule blocking direct
    Prisma imports.
15. **Docs to update with the refactor:** `AGENTS.md` (state the one-contract rule as the governing
    rule), `docs/DECISIONS.md` (rows for each change above), README.

## Open: auth library

- **Decided:** use a real auth library, either **Auth.js (v5)** or **Better Auth**. The hand-rolled
  email-only login is a placeholder and will not be extended.
- **Discuss next:** which one. Constraint to check first: both libraries' Prisma adapters target
  the Prisma 6/7 client API, but this repo runs **Prisma 8 (RC, contract-based:
  `db.orm.public.<Model>`)**. Options include pointing Better Auth at Postgres directly through its
  built-in `pg`/Kysely support and modelling its tables in `prisma/contract.prisma`, or
  reconsidering Prisma 7.10.0 (stable). Also check: database vs JWT sessions, how `role` reaches
  `requireUser()`, credentials vs OAuth/magic link, and fit with Server Actions.
- The DAL's `requireUser()` / `requireAdmin()` and the sign-in/sign-out actions are the only code
  that should depend on the auth library.

## Suggested order for the next session

1. Choose the auth library (check the Prisma 8 adapter question).
2. Decide what to do with the uncommitted changes listed under "Repo state".
3. Write the refactor plan (`docs/superpowers/plans/`), then implement.
4. Run the adversarial review that was skipped.

## Carried-over issues (not yet fixed)

- Mobile menu has no log in / log out control.
- Low contrast: white text on the yellow primary token (default Button), inherited from the Nuxt
  palette.
- Only `/ui-kit` on desktop was visually checked.
- README setup was never replayed against an empty dev database.
- `@prisma/orm-toolchain` is pinned via `overrides` to match the Prisma 8 RC runtime; fragile
  across Prisma bumps.

## Reference

- Sources: `/Users/abdoachkar/programming/nuxt-3-template` (UI conventions, tokens),
  `/Users/abdoachkar/programming/revcube-nuxt` (newer service/form structure; legacy layer must not
  be used), `/Users/abdoachkar/programming/archer-frontend-nuxt3` (presenter pattern, AGENTS.md).
- Next 16 docs consulted: `node_modules/next/dist/docs/01-app/02-guides/data-security.md` (DAL),
  `01-app/01-getting-started/07-mutating-data.md`, `09-revalidating.md` (`updateTag` is Server
  Actions only; `revalidateTag` works in Route Handlers).
- Original baseline plan: `docs/superpowers/plans/2026-10-05-next-template-baseline.md`.
