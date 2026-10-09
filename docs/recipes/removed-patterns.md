# Removed patterns, in one paragraph each

What each pattern looked like in this architecture, the decisions that mattered, and where to find
the implementation (`git show 7bd01c5:<path>`). None of it is in the repo today.

## Notifications, realtime (SSE) and Web Push

A `Notification` table with flat columns (`userId`, `type` enum, `title`, `body`, `url`, `readAt`),
written by an **internal** DAL function (`createNotification`, no `requireUser()`, called by other DAL
functions after their own checks, never by a page or action) that also published the row on a Redis
channel. `GET /api/v1/events` was a Route Handler returning `text/event-stream`: it checked the
session first (401 JSON before any stream), sent the unread count as the first event, forwarded the
user's channel, pinged every 25 s, and ended after 10 minutes so `EventSource` reconnected and
re-authenticated (a revoked session stopped receiving within that window). Headers that matter:
`Cache-Control: no-cache, no-transform` (or Next's gzip buffers the stream) and
`X-Accel-Buffering: no`. Redis pub/sub needs a **second** connection for `SUBSCRIBE` (a subscribed
connection accepts no other command) without a command timeout. Route Handlers cannot host
WebSockets; Centrifugo is the upgrade if client-to-server messaging is ever needed. Web Push added a
`PushSubscription` table (endpoint unique, at most ten per user), the VAPID trio of variables (all or
none), a `send-push` job (only the worker holds the private key), and a service worker that always
shows an OS notification (browsers require one per push) served with `Cache-Control: no-store`.
`url` values were app paths validated with `safeRedirectPath(value, '') === value`. Files:
`lib/data/notifications.ts`, `lib/data/push.ts`, `lib/data/channels.ts`, `lib/server/realtime.ts`,
`lib/server/push.ts`, `app/api/v1/events/route.ts`, `app/api/v1/notifications/route.ts`,
`hooks/useRealtime.ts`, `components/Notifications/*`, `public/sw.js`, `jobs/sendPush.ts`,
`docs/guides/realtime.md`.

## Audit log

An `AuditLog` table (`actorId` with `onDelete: SetNull` so the entry outlives its actor, `action`
from a closed Zod enum like `post.update` / `user.role`, `entityType` derived from the part before
the dot, `entityId` as text, `metadata` JSON) with one internal writer (`recordAudit`, no
`requireUser()`, called inside DAL write functions **after** the write succeeded and caches were
invalidated; a failure was logged and swallowed because the change was already saved) and one
admin-only reader (`listAuditLog`, never cached) behind `/admin/audit`. `metadata` held ids, field
names and state names only, never a title, body or email: the log outlives the records. It was kept
outside the write's transaction on purpose (a lost entry beats a failed write the user already saw
succeed); passing the transaction client through makes it atomic. Files: `lib/data/audit.ts`,
`lib/dto/audit.ts`, `app/(site)/admin/audit/*`, `docs/guides/audit.md`.

## Soft delete (trash and restore)

A `deletedAt` column, indexed with the owner. `deletePost` set it with a conditional write
(`updateMany where deletedAt: null`), `restorePost` cleared it (`where deletedAt: { not: null }`),
and an hourly job purged rows older than 30 days in locked batches (re-checking the cut-off under
`FOR UPDATE`, so a restore that raced the purge won). Every public read filtered `deletedAt: null`
through one shared filter builder so no caller could forget; the policy record carried `deletedAt`
so every rule but `restore` was false for a trashed record; writes on a trashed record answered
404 and `restore` on a live one too; only the owner or an admin could list the trash
(`trash: true` in the list query, honoured only on the viewer's own list). The query flag was
`z.union([z.boolean(), z.stringbool()])`, never `z.coerce.boolean()`, which reads `'false'` as true
(the template keeps that as `booleanParamSchema`). Files: `lib/data/posts.ts` (`deletePost`,
`restorePost`, `resolvePostFilter`), `purgeDeletedPosts` in `lib/data/maintenance.ts`,
`components/Posts/RestoreButton`, `docs/guides/posts.md`.

## Full-text search (Postgres `tsvector`)

A nullable `search_vector tsvector` column with a GIN index, filled by a `BEFORE INSERT OR UPDATE OF
title, body` trigger (`setweight(to_tsvector('english', title), 'A') || setweight(..., body, 'B')`),
so no write path could leave it stale. A trigger, not a `GENERATED` column: Prisma cannot model a
generated column and proposed an invalid `DROP DEFAULT` on every `migrate dev`; Prisma sees the
column as `Unsupported("tsvector")?` and ignores triggers, so the schema and the database agree.
Queries used `websearch_to_tsquery('english', q)` (quoted phrases, `or`, `-exclusion`, never a
syntax error) in one tagged `$queryRaw` returning the page of ids and the total, then read the
summaries with Prisma by id in the query's order. The visibility filter was rendered twice, as a
Prisma `where` and as `Prisma.sql` conditions, from one description, with a parity test so the two
could not drift. Ranked by `ts_rank` while searching. Files: the `*_add_post_search_vector` and
`*_post_search_vector_trigger` migrations, `searchPosts`, `toSqlConditions` in `lib/data/posts.ts`,
`tests/lib/data/postsSearch.test.ts`, `docs/guides/search.md`.

## Nested resource and cursor pagination (comments)

A `Comment` model cascading from post and user; a `commentPolicy` (delete: the comment's author,
the post's author or an admin); `createComment` applied the post's `view` rule to its own database
read (never the cache) and rate limited per user; a notification to the post's author for someone
else's comment. The list was a **cursor page** (`{ items, nextCursor }`, no total, no `OFFSET`):
`limit + 1` rows ordered by id with `id > cursor`, the cursor an opaque base64url id; an unreadable
cursor started from the first page instead of failing; only the first page was cached. The client
side was `useInfiniteList(fetchPage, { initial })` with an `IntersectionObserver` sentinel and a
Load more fallback, fed by a client facade that parsed the Route Handler's JSON with the shared
schema. Files: `lib/data/comments.ts`, `lib/dto/comments.ts`, `lib/cursor.ts`, `cursorQuerySchema`
and `toCursorPage` in `lib/dto/common.ts`, `hooks/useInfiniteList.ts`, `components/InfiniteSentinel`,
`components/Comments/*`, `app/api/v1/posts/[id]/comments/route.ts`.

## Many-to-many with a visible join table (tags)

`Tag { name unique, lowercased }` and an explicit `PostTag` join model with a composite id (never
Prisma's implicit many-to-many: the join is a real table you can index and query). Tags were written
with the post in one interactive transaction: `createMany` with `skipDuplicates` (one
`INSERT ... ON CONFLICT DO NOTHING`, safe under concurrency where an upsert is not), names inserted
in sorted order so two transactions sharing new tags could not deadlock, then the links replaced.
Lists exposed the tags of published posts with counts, capped at 100 and cached. The UI was a chips
input wired through RHF's `Controller`. Files: `replacePostTags` and `listTags` in
`lib/data/posts.ts`, `tagNameSchema` in `lib/dto/posts.ts`, `components/Form/TagsInput`.

## React Email

`@react-email/components` templates rendered with `render(react)` and `render(react, { plainText: true })`.
Its renderer needs `react-dom/server`, which the React Server layer refuses to load, so rendering had
to happen in the worker; that constraint alone forced emails through the job queue. The plain
templates in `emails/` have no such constraint. Use React Email only if you already run a worker
and want component-based templates. Files: `emails/*.tsx`, `jobs/sendEmail.ts`.

## Client fetch facades

When a client component must fetch (an infinite list, a live search), put the call in
`lib/client/<name>.ts`: a `getJson(url, schema, signal?)` helper that throws a `RequestError`
(message + status) on a non-2xx answer and parses the body with the shared `lib/dto` schema, so
dates come back as `Date`s; the component never calls `fetch`. ESLint can forbid `@/lib/server/*`
from `lib/client` like it does for components. Files: `lib/client/getJson.ts`,
`lib/client/errors.ts`, `lib/client/posts.ts`, `app/(site)/posts/csr/*`.
