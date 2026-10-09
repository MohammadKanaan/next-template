# Route Handlers

- Use a Route Handler only when an HTTP API is required (the REST endpoints under
  `app/api/v1/posts`) or when a client component must fetch. It stays thin: for a query,
  `parseInput` it to decode it (every value arrives as a string); for a body, `readJsonBody(request)`
  and decode it with the DTO schema (`parseInput(createPostInput, …)`); then call the DAL (which
  validates again, because it trusts no caller) and return JSON or `toErrorResponse(error)`.
- **REST API (`app/api/v1/posts`):** `GET`/`POST /posts`, `GET`/`PATCH`/`DELETE /posts/[id]`
  (table in the README). Auth is the session cookie. A write handler first calls `requireUser()`
  (so an anonymous caller gets 401 whatever the body or content type), then reads the body with
  `readJsonBody(request)` (`lib/data/errors.ts`), which rejects a content type other than
  `application/json` and maps malformed JSON to a `ValidationError` (both 422); that requirement
  plus the `SameSite=Lax` cookie is the CSRF guard, since a cross-site form cannot send JSON without
  a CORS preflight. Handlers type their context with the generated `RouteContext<'/api/v1/posts/[id]'>`,
  await `params`, decode the body with the DTO schema and pass it, with the raw `id` string, to the
  DAL, which validates both again. Status codes: 201 for a create (with the created DTO), 200 for
  reads and updates, 204 with an empty body for a delete, errors through `toErrorResponse`
  (401/403/404/422/429). No UI calls these endpoints; their tests call the handlers directly
  (`tests/app/api/v1/`). API keys and OpenAPI are deferred.
- **A client component that must fetch** calls the Route Handler and parses the response with the
  shared `lib/dto` schema (`postsPageSchema.parse(await response.json())`, so dates come back as
  `Date`s), inside a small facade function rather than inline `fetch` in the component. No page
  does this today: every list is server-rendered and every write is a Server Action. Add the
  facade when you add the first client-fetched list.
- `GET /api/health` is the other Route Handler. It is for load balancers and container probes: it
  awaits `connection()`, calls `checkHealth()` (database `SELECT 1` and Redis `PING`, each with a
  2 s timeout) and returns 200 `{ status: 'ok', checks }` or 503 `{ status: 'degraded', checks }`.
  It never includes error details.
- `app/api/auth/[...all]` mounts Better Auth's router (`toNextJsHandler`); see **Authentication**
  for the paths it closes.
