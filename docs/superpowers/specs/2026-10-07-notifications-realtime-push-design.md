# In-app notifications, SSE realtime and Web Push — design

Approved 2026-10-07. Implements the "Real-time" item deferred in `docs/DECISIONS.md`.

## Decisions

- **Scope:** in-app notifications (a `notifications` table, a bell with an unread badge, a popover
  with the latest ten, a `/notifications` page) delivered live while a tab is open, **plus** browser
  Web Push (service worker + VAPID) so the OS shows a notification when no tab is open.
- **First event:** "someone commented on your post". `createComment` notifies the post author, never
  for a self-comment. A new event type is one enum value plus one `createNotification()` call.
- **Transport:** server-sent events from a Route Handler (`GET /api/v1/events`), fanned out across
  web instances with Redis pub/sub. No new container. Verified in the installed Next docs: Route
  Handlers cannot host WebSockets (`backend-for-frontend.md`: "WebSockets won't work because the
  connection closes on timeout, or after the response is generated"), and Next's bundled
  `compression` skips a response whose `Cache-Control` contains `no-transform`, so the stream is not
  buffered by `next start`. Server→client only is enough: every write already goes through Server
  Actions. The seam for a later swap to Centrifugo is `lib/server/realtime.ts`
  (`publish` / `subscribe`) and the `useRealtime` hook.
- **Web Push:** the `web-push` package, sent only by the worker through a `send-push` pg-boss job.
  Keys are an optional env trio `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — all or
  none, like the Google pair — and push is simply off without them. The public key reaches the
  browser as a page prop from the DAL (`getPushConfig()`), not as a `NEXT_PUBLIC_` build arg.
- **No `remember()` anywhere in this feature:** every read is per viewer.
- **`createNotification` is an internal DAL function** (no `requireUser()`): it is called by DAL
  functions that already enforced their own rules, like `maintenance.ts` is for jobs.

## Architecture

```
createComment ──► createNotification (lib/data/notifications.ts)
                    ├─ INSERT notifications row
                    ├─ publish(userChannel(id), { type: 'notification', notification })  (Redis PUBLISH)
                    └─ enqueue('send-push', { userId, title, body, url })   only when VAPID is set

GET /api/v1/events ──► subscribeToNotifications(listener)  (DAL: requireUser → channel + unread count)
   text/event-stream    lib/server/realtime.ts: one subscriber Redis connection per process,
   first event: unread   Map<channel, Set<listener>>, SUBSCRIBE on first / UNSUBSCRIBE on last
   `: ping` every 25 s

worker: handleSendPush ──► maintenance.listPushSubscriptions(userId) → sendPush (web-push)
                            404 / 410 → maintenance.deletePushSubscriptionByEndpoint(endpoint)

browser: useRealtime(onEvent) → NotificationBell (badge, popover, toast)
         public/sw.js: 'push' → always showNotification; 'notificationclick' → focus the window at url, else open it
         PushSettings card on /settings: register the SW, subscribe, subscribePushAction / unsubscribePushAction
```

## Data

Two models, one migration (`add_notifications_push`), both cascading from `User`:

- `Notification`: `id` (autoincrement), `userId` (recipient), `type` (`NotificationType` enum:
  `comment`), `title`, `body`, `url` (an app path), `readAt` (nullable), `createdAt`. Indexes
  `[userId, readAt]`, `[userId, createdAt]`. Flat columns, not a per-type JSON payload: the UI
  renders them directly and a new type needs no new schema.
- `PushSubscription`: `id` (uuid), `userId`, `endpoint` (unique), `p256dh`, `auth`, `createdAt`.

## Contracts

- `lib/dto/notifications.ts`: `notificationSchema` / `Notification`, `notificationsPageSchema`,
  `listNotificationsQuery` (= `pageQuerySchema`), `notificationsUrlQuery` (tolerant `page`),
  `createNotificationInput`, `realtimeEventSchema` / `RealtimeEvent` =
  `{ type: 'unread', count } | { type: 'notification', notification }`.
- `lib/dto/push.ts`: `pushSubscriptionInput` (the shape of `PushSubscription.toJSON()`),
  `pushEndpointSchema`, `pushConfigSchema` / `PushConfig`.
- `lib/data/channels.ts`: `userChannel(id)` = `realtime:user:<id>`.
- Realtime events: a `notification` event carries the full DTO (the bell prepends it, no fetch); an
  `unread` event carries the authoritative count and is sent on every (re)connect and after every
  mark-as-read, so every tab self-heals.
- Web Push payload: `{ title, body, url }`. The service worker always shows the OS notification,
  even when a window of the origin is focused: the subscription is `userVisibleOnly`, Chrome and
  Safari require a visible notification per push, and Safari may revoke a subscription that skips
  one. A focused tab therefore gets the bell's toast and the system notification. A payload that is
  missing or not JSON shows a generic "New notification" (no url). On click the worker focuses a
  window already at the url, otherwise opens one; it never navigates an existing tab.

## Error handling

- `publish` never throws (logged, like the cache). A failed `SUBSCRIBE` propagates: the events
  route answers 500. A non-200 response closes an `EventSource` for good (it only reconnects by
  itself after a network drop or a clean close), so `useRealtime` listens for `onerror`, and when the
  stream is `CLOSED` it opens a new one after a backoff (1 s, doubling to 30 s, reset on `onopen`),
  which succeeds once Redis is back.
- `send-push`: a `PushGoneError` (404 / 410 from the push service) deletes that subscription; any
  other failure is rethrown after the loop so pg-boss retries (`retryLimit: 2`; a retry may re-send
  to the other subscriptions — accepted).
- `markNotificationRead` on a notification that is not the viewer's answers `NotFoundError` (it is a
  read of the viewer's own inbox, so 404 rather than 403).

## Testing

Tests mirror the source tree (`tests/lib/server/realtime.test.ts`, `tests/lib/data/notifications.test.ts`,
`tests/jobs/sendPush.test.ts`, `tests/app/api/v1/events.test.ts`, `tests/hooks/useRealtime.test.tsx`,
`tests/components/Notifications/*.test.tsx`, `tests/components/Settings/PushSettings.test.tsx`).
Server tests use the real test database and Redis 15; `web-push` and the service worker are faked.
