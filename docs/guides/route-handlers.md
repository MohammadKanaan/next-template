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
  204 with an empty body for a delete, errors through `toErrorResponse` (401/403/404/422/429).
  There is deliberately no status endpoint: transitions stay in `setPostStatusAction`. There are no
  client facades for these endpoints because no UI calls them; their tests call the handlers
  directly (`tests/app/api/v1/`). API keys and OpenAPI stay deferred.
- **Realtime and notifications:** `GET /api/v1/events` (the SSE stream, see **Realtime and
  notifications**) and `GET /api/v1/notifications?page&perPage` (the bell's popover reads the latest
  ten through `lib/client/notifications.ts`; the `/notifications` page reads the DAL directly). Both
  need a session (401 JSON otherwise) and are per viewer, so neither is cached.
- `GET /api/health` is the other Route Handler. It is for load balancers and container probes,
  not for the client facade: it awaits `connection()`, calls `checkHealth()` (database `SELECT 1`
  and Redis `PING`, each with a 2 s timeout) and returns 200 `{ status: 'ok', checks }` or 503
  `{ status: 'degraded', checks }`. It never includes error details.
