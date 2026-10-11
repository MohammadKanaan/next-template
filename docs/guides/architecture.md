# Architecture

How the template is put together, and where each pattern is done once.

## Layers

```
prisma/schema.prisma ──prisma generate──▶ generated/prisma (git-ignored)

lib/dto/*  Zod schemas: inputs and outputs, types via z.infer (client- and server-safe)
lib/data/* server-only DAL: the only code that touches Prisma; enforces auth; validates inputs; returns DTOs

Server Component ─────────────────▶ lib/data ──▶ PostgreSQL
                                           └──▶ Redis, job queue (lib/server) ──▶ worker/ ──▶ Resend
Server Action (actions/*) ────────▶ lib/data
Route Handler (app/api/v1) ───────▶ lib/data   (decodes with lib/dto, answers JSON)
```

Three callers reach the same functions: a Server Component, a Server Action and a Route Handler. All
three get the same DTO under the same auth rules, because `lib/data` enforces both itself.

## DTOs

`lib/dto` holds Zod schemas for inputs (`createPostInput`, `signUpInput`) and outputs
(`postSummarySchema`, `postDetailSchema`); `z.infer` gives the types. Output schemas use
`z.coerce.date()`, so a client parsing JSON gets `Date` back. Lists are `Page<T>`.

## Data Access Layer

`lib/data/*` is `server-only` and the only code that imports Prisma (ESLint enforces it). Each
function selects exactly the columns its DTO needs, maps the row to the DTO, and enforces auth
itself with `requireUser()` / `requireAdmin()` plus record-level rules in `lib/data/policies`
(a post may be changed by its author or an admin). It also validates its own inputs with the
`lib/dto` schema (`parseInput`), so the rules hold whichever caller reaches it.

## Server Actions

Writes live in `actions/`: call the DAL, which validates, then `revalidatePath` / `refresh`, and
return an `ActionResult<T>`. Forms map failures onto fields with `applyActionErrors`.

## Route Handlers

The REST endpoints below exist for HTTP API clients; no UI calls them. Each handler reads the body
with `readJsonBody`, decodes it with the DTO schema, and passes it, with the raw route `id`, to the
DAL, which validates again and authorizes. Authentication is the session cookie. Writes require
`Content-Type: application/json`, which a cross-site form cannot send without a CORS preflight; that
plus the `SameSite=Lax` cookie is the CSRF guard.

| Method   | Path                 | Auth                                                 | Success                                                                                  |
| -------- | -------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET`    | `/api/v1/posts`      | none (drafts: own list, or admin with `published`)   | 200 `Page<PostSummary>`; filters `q`, `sort`, `published`, `authorId`, `page`, `perPage` |
| `POST`   | `/api/v1/posts`      | signed in                                            | 201 `PostDetail`                                                                         |
| `GET`    | `/api/v1/posts/{id}` | none for a published post; author or admin otherwise | 200 `PostDetail`                                                                         |
| `PATCH`  | `/api/v1/posts/{id}` | author or admin                                      | 200 `PostDetail` (`title`, `body`, `published`; at least one)                            |
| `DELETE` | `/api/v1/posts/{id}` | author or admin                                      | 204, empty body                                                                          |

Errors are `{ code, message, fieldErrors? }` with 401, 403, 404, 422 or 429. A 422 covers
validation, a non-JSON content type and malformed JSON. `GET /api/health` returns 200 when
PostgreSQL and Redis answer and 503 otherwise, with ok or fail per dependency and no error text.

## Errors

The DAL throws `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ValidationError` and
`RateLimitedError`. Actions turn them into `ActionResult` failures, the Route Handler into
401/403/404/422/429 JSON, and `loadPage` into a login redirect or `notFound()`.

## Presenters

Types are the source of truth; presenters exist only for overrides. A presenter is a plain function
that spreads the DTO and replaces just the fields a view needs reshaped. `presentUser` turns a bare
`website` domain into a linkable URL.

## Caching and rendering

Pages are async Server Components rendered per request. They await their data, so redirects and
not-found pages answer with real status codes. Redis is the only cache: the DAL caches
viewer-independent reads with tag versions and invalidates inside the write functions. Next's Cache
Components (`'use cache'`) are off, so there is no second cache to keep in sync.

## Jobs and email

`jobs/definitions.ts` lists each job (name, Zod payload, retry options, cron). `enqueue()` validates
and sends; the worker runs the handlers. Better Auth's verification, reset and email-change mails are
queued as `send-email` jobs without awaiting, so response time cannot reveal whether an account
exists. The worker renders the plain templates in `emails/` and sends through Resend, or logs the
mail when no key is set. Jobs that touch the database use the system DAL
`lib/data/maintenance.ts`, importable only from `jobs/`.

## Styling and components/SCN

`styles/global.css` contains the official shadcn neutral theme, light and dark tokens, and Tailwind
base styles. Application CSS Modules use those tokens directly. `components/SCN` holds stock
CLI-generated primitives, with no local styling or API overrides. Forms use `components/Form/Input`
and `components/Form/Textarea` for labels and errors, and `LoadingButton` composes the stock Button
and Spinner. Callers do not pass `className` or `style` to application components. `AGENTS.md` has
the full rules. Add or reinstall primitives with
`bunx shadcn@latest add button input textarea --overwrite --yes`, and keep `lib/utils.ts` for the
CLI's `cn` utility only. The `/ui-kit` catalog exercises the components and the theme toggle.

## Auth

Better Auth with email and password, database sessions, the `admin` plugin and the `nextCookies`
plugin. `proxy.ts` redirects private routes to `/login?next=...` when the session cookie is absent,
and treats unknown paths as private. It only checks that the cookie exists, so the `/login` and
`/signup` pages redirect signed-in users themselves and a stale cookie cannot lock anyone out. The
DAL does the real check on every read and write. Sign-up sends a verification email and the login
form links to a password reset. Verification is soft: unverified users can sign in and see a banner
with a Resend button. Resetting a password signs out every session.

Better Auth's HTTP routes that would bypass the DAL's validation and rate limits are disabled:
`/sign-up/email`, `/sign-in/email`, `/update-user`, `/delete-user`, the password and email changes,
and every `/admin/*` route of the admin plugin. The matching Server Actions and DAL functions are the
only way in. Auth and account actions are rate limited in production, backed by Redis so the limit is
shared across instances; if Redis is down the attempt is allowed. Full detail in
[`authentication.md`](authentication.md).

`/settings` is the account page: profile (name, username, website), email change (confirm at the
current address, verify the new one), password change, active sessions (revoke one or all others) and
account deletion, which requires the password and cascades posts and sessions.

## Admin

`/admin` is admins only; anyone else gets the not-found page and signed-out visitors go to login. It
lists users with search and pagination and lets an admin change a role, ban or unban a user, and
impersonate a regular user. A banned user is signed out everywhere and cannot sign in, and sees the
reason. Impersonation is a one-hour session with a banner and a "Stop impersonating" button. Reads
are the app's own queries. Writes wrap the admin plugin's server API (`auth.api.setRole`, `banUser`,
`impersonateUser`, ...) behind `requireAdmin()` and one extra rule: an admin cannot change their own
role, so the last admin cannot lock everyone out.

## Google sign-in (optional)

With `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` both set, `/login` and `/signup` show a "Continue
with Google" button. With neither set the button is absent and nothing else changes. Setting only one
fails at boot in production. Add the authorized redirect URI
`<BETTER_AUTH_URL>/api/auth/callback/google` in the Google Cloud Console. A new Google user gets a
username derived from the email's local part plus a random suffix, changeable in settings. A
Google-only account has no password, so `/settings` points it at "Forgot password" to set one. The
round trip with Google has not been run here, since it needs real credentials.

## Pattern index

Where to look to see each pattern done once.

| Pattern                               | Where it is shown                                                                                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-rendered list with URL filters | `app/(site)/posts/page.tsx` + `view.tsx`; `hooks/useUrlState.ts`; `postsUrlQuery` in `lib/dto/posts.ts`; `components/Posts/Filters`                                                      |
| Create / edit form with field errors  | `components/Posts/Form/index.tsx` (+ `utils.ts`); `lib/formErrors.ts` (`applyActionErrors`); `actions/posts.ts`; pages `/posts/new` and `/posts/[id]/edit`                               |
| Controlled form field                 | the Published `Checkbox` wired through RHF's `Controller` in `components/Posts/Form/index.tsx`                                                                                           |
| Record-level authorization policies   | `lib/data/policy.ts` (`authorize`, `permissionsFor`); `lib/data/policies/posts.ts` (`postPolicy`); used by `requirePostChange` in `lib/data/posts.ts`                                    |
| Viewer-dependent visibility           | `postPolicy.view`, `getPost` and `listPosts` in `lib/data/posts.ts` (cache the shared part, check the viewer after)                                                                      |
| Redis caching and invalidation        | `remember` / `invalidateTags` in `lib/server/cache.ts`; tags in `lib/data/cacheTags.ts`; used in `lib/data/posts.ts` and `lib/data/users.ts`                                             |
| REST CRUD handlers                    | `app/api/v1/posts/route.ts`, `app/api/v1/posts/[id]/route.ts`; `readJsonBody` and `toErrorResponse` in `lib/data/errors.ts`                                                              |
| Rate limiting                         | `consumeRateLimit` / `getClientIp` in `lib/data/rateLimit.ts`; per IP and per account in `actions/auth.ts`, per user in `createPost`                                                     |
| Wrapping a Better Auth plugin         | `lib/data/admin.ts` (`setUserRole`, `banUser`, `impersonateUser` over `auth.api.*`); `actions/admin.ts`; page `app/(site)/admin`                                                         |
| Admin-only page                       | `app/(site)/admin/page.tsx` + `view.tsx`; `listUsers` with `requireAdmin()` in `lib/data/admin.ts`; `loadPage` turns 403 into the not-found page                                         |
| Account settings on Better Auth       | `actions/auth.ts` (`changePasswordAction`, `changeEmailAction`, `deleteAccountAction`); `lib/data/sessions.ts`; `app/(site)/settings`                                                    |
| Background job and email              | `jobs/definitions.ts`, `jobs/sendEmail.ts`, `jobs/cleanup.ts`; `lib/server/queue.ts`; `worker/index.ts`; `lib/server/mailer.ts`; `emails/`                                               |
| OAuth (Google)                        | `lib/data/auth.ts` (`socialProviders`, `isGoogleAuthEnabled`); `signInWithGoogleAction` in `actions/auth.ts`; `lib/username.ts`; `components/Auth/GoogleButton`                          |
| Direct-to-storage upload (R2)         | `lib/server/storage.ts` (presigned PUT); `createUpload` / `attachAvatar` in `lib/data/uploads.ts`; `lib/client/uploads.ts`; `components/Settings/AvatarUploader`; `jobs/deleteObject.ts` |
| Health check                          | `lib/data/health.ts`; `app/api/health/route.ts`                                                                                                                                          |

## Adding a resource

The posts domain is the worked example. Copy its shape, in this order.

1. **Schema.** Add the model to `prisma/schema.prisma`: camelCase fields with snake_case `@map`s, an
   index on every foreign key you filter by, `onDelete: Cascade` where the child cannot outlive its
   parent. Then `bun run db:migrate` and `bun run db:test:prepare`. A new table that does not hang
   off `users` goes into `resetDatabase()`'s TRUNCATE list in `tests/helpers/server.ts`.
2. **DTOs** in `lib/dto/<name>.ts`: one input schema per write, one output schema per read shape
   (`...Summary` for lists, `...Detail` for one record), output dates with `z.coerce.date()`, list
   query schemas with every field bounded. Add a URL-facing twin (`xxxUrlQuery`) with `.catch()` on
   every field if the list keeps its filters in the query string.
3. **DAL** in `lib/data/<name>.ts`, starting with `import 'server-only'`. Per function: `requireUser()`
   or `requireAdmin()`, then `parseInput`, then existence, then permission; select exactly the DTO
   columns and map rows to DTOs; typed errors only. Use `db.$transaction` when one write touches
   several tables. Cache with `remember()` only the viewer-independent, bounded reads, and invalidate
   inside the write functions; new tags go in `lib/data/cacheTags.ts`. Put the record-level rules
   (who may view, edit, delete) in `lib/data/policies/<name>.ts` as pure functions of
   `(viewer, record)`, call them with `authorize()` after the exists check, and build the DTO's
   `permissions` with `permissionsFor()` (`lib/data/policy.ts`). Test it first, in
   `tests/lib/data/<name>.test.ts`, per viewer: signed out, owner, other user, admin.
4. **Server Actions** in `actions/<name>.ts`: pass the arguments to the DAL untouched, then
   `revalidatePath` / `refresh`, and return `ActionResult<T>` through `toActionFailure`. Add a Route
   Handler under `app/api/v1/<name>/` only for an HTTP API or a client component that must fetch.
   Handlers stay thin: decode with the DTO schema, call the DAL, return JSON or `toErrorResponse`.
5. **Pages and forms.** `page.tsx` is an async Server Component: await `params` / `searchParams`,
   load through `loadPage`, render. Add a `'use client'` `view.tsx` beside it only for what is
   interactive. Forms use React Hook Form with the DTO schema, start with the `'use client'` /
   `'use no memo'` header (copy `components/Posts/Form`) and map failures with `applyActionErrors`.
   Styles are an SCSS module with shadcn tokens.
6. **Routes and navigation.** Add the route constants to `lib/constants-routes.ts` and decide whether
   each route is public (`PUBLIC_ROUTES`) or private, which is the default. Add the NavBar link.
7. **Presenters**, only if a view needs reshaped fields: add `presentX` in
   `presenters/<Name>Presenter.ts`.
8. **Seed and tests.** Extend `prisma/seed.ts`. Add `tests/actions/<name>.test.ts`, component tests
   under `tests/components/`, and handler tests under `tests/app/api/v1/` when there is a handler.

## Removing the posts example

Once your first resource looks like posts, delete posts. `bun run typecheck` and `bun run lint`
find whatever this list misses.

- `actions/posts.ts`, `app/(site)/posts/**`, `app/api/v1/posts/**`, `components/Posts/**`
- `lib/dto/posts.ts`, `lib/data/posts.ts`, `lib/data/policies/posts.ts`, `lib/excerpt.ts`
- the `Post` model and the `posts` relation on `User` in `prisma/schema.prisma`, then
  `bun run db:migrate`
- `POSTS_TAG` and `postTag` in `lib/data/cacheTags.ts`, and their two uses in `lib/data/users.ts`
  and `lib/data/auth.ts`
- the post routes in `lib/constants-routes.ts` and `components/Layout/NavBar`
- the posts in `prisma/seed.ts` and `posts` in `resetDatabase()` (`tests/helpers/server.ts`)
- the posts sections of `app/(site)/ui-kit/view.tsx`, the matching tests under `tests/`,
  `docs/guides/posts.md`, and the posts rows in the pattern index above

## Design decisions

- **One contract.** Three paths (Server Component, Server Action, Route Handler) end at the same DAL
  function and return the same DTO type under the same auth rules.
- **DAL and DTO boundary.** Prisma rows never leave `lib/data`. Callers only see Zod-defined DTOs,
  and the DAL's `select` plus mapping make schema drift a compile error.
- **Auth in the DAL.** A page, action or proxy that forgets a check cannot bypass authorization,
  because the data functions enforce it themselves.
- **Server Actions vs Route Handlers.** Actions for UI writes, so there is no extra HTTP surface to
  design. A Route Handler where an HTTP API is required or a client has to fetch.
- **Typed errors per caller.** One set of error classes, translated once per transport.
- **Small on purpose.** Notifications, an audit log, soft delete, optimistic locking, full-text
  search and comments were all built once in this template and then removed, because every project
  that started from it had to delete them. `docs/recipes/` says how to add each one back in this
  architecture, and `docs/DECISIONS.md` ("Removed") says where it is in the history.
