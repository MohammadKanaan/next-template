# Route Handlers and client facades

- Use a Route Handler only when a client component must fetch (the `/posts/csr` example) or when an
  HTTP API is required (the REST endpoints under `app/api/v1/posts`, below). It stays thin: for a
  query, `parseInput` it to decode it (every value arrives as a string); for a body,
  `readJsonBody(request)` and decode it with the DTO schema (`parseInput(createPostInput, …)`), as a
  query is decoded; then call the DAL (which validates again, because it trusts no caller),
  return JSON or `toErrorResponse(error)`.
- The client calls it through a facade in `lib/client` (`fetchPosts`) that parses the response with
  the shared `lib/dto` schema and throws `RequestError` (message + status) on failure. Components do
  not call `fetch` directly.
- `/posts/csr` is the single live example of this path and has an end-to-end test.
- **REST API (`app/api/v1/posts`):** `GET`/`POST /posts`, `GET`/`PATCH`/`DELETE /posts/[id]`,
  `GET`/`POST /posts/[id]/comments` (table in the README). Auth is the session cookie. A write handler
  first calls `requireUser()` (so an anonymous caller gets 401 whatever the body or content type),
  then reads the body with `readJsonBody(request)` (`lib/data/errors.ts`), which rejects a content type other than
  `application/json` and maps malformed JSON to a `ValidationError` (both 422); that requirement
  plus the `SameSite=Lax` cookie is the CSRF guard, since a cross-site form cannot send JSON without
  a CORS preflight. Handlers type their context with the generated `RouteContext<'/api/v1/posts/[id]'>`,
  await `params`, decode the body with the DTO schema (`parseInput(updatePostInput, …)`, as the
  GET handler decodes its query) and pass it, with the raw `id` string, to the DAL, which validates
  both again. Status codes: 201 for a create (with the created DTO), 200 for reads and updates,
  204 with an empty body for a delete, errors through `toErrorResponse` (401/403/404/409/422/429).
  There is deliberately no status endpoint: transitions stay in `setPostStatusAction`. There are no
  client facades for these endpoints because no UI calls them; their tests call the handlers
  directly (`tests/app/api/v1/`). API keys and OpenAPI stay deferred.
- **Realtime and notifications:** `GET /api/v1/events` (the SSE stream, see **Realtime and
  notifications**) and `GET /api/v1/notifications?cursor&limit` (the bell's popover reads the latest
  ten, and the `/notifications` view loads its later pages, through `lib/client/notifications.ts`;
  the page renders the first page from the DAL directly). Both
  need a session (401 JSON otherwise) and are per viewer, so neither is cached.
- `GET /api/health` is the other Route Handler. It is for load balancers and container probes,
  not for the client facade: it awaits `connection()`, calls `checkHealth()` (database `SELECT 1`
  and Redis `PING`, each with a 2 s timeout) and returns 200 `{ status: 'ok', checks }` or 503
  `{ status: 'degraded', checks }`. It never includes error details.
- **Cursor pagination:** feeds that grow (a post's comments, the notifications) are
  `CursorPage<T> = { items, nextCursor }` (`lib/dto/common.ts`), not `Page<T>`: no total, no
  `OFFSET`. The query is `cursorQuerySchema` (`cursor` at most 64 characters, `limit` 1 to 50,
  default 20). A cursor is the id of the last item of the previous page as base64url text
  (`encodeCursor` / `decodeCursor` in `lib/cursor.ts`, client-safe); the DAL reads `limit + 1` rows
  ordered by id (`id > cursor` for oldest first, `id < cursor` for newest first) and `toCursorPage`
  turns the extra row into `nextCursor`. A cursor `decodeCursor` cannot read starts from the first
  page (it is not a 422), a `limit` out of range is a 422. Only the first page of a thread is
  cached (`comments:<id>:first:<limit>`, so the key space is bounded); later pages read the
  database. The facades `fetchComments` and `fetchNotifications` return the same `CursorPage`. The
  client side is `useInfiniteList(fetchPage, { initial })` (see `hooks.md`): the page renders the
  first page on the server, and the view appends the rest. `GET /api/v1/posts/[id]/comments` and
  `GET /api/v1/notifications` take `cursor` and `limit`; the post lists keep `page` and `perPage`.
