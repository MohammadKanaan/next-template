# Realtime and notifications

In-app notifications are delivered live over server-sent events, with Web Push for browsers with no
tab open. The first event is "someone commented on your post".

- **Contract:** `lib/data/notifications.ts` (`createNotification`, `listNotifications`,
  `getUnreadNotificationCount`, `markNotificationRead`, `markAllNotificationsRead`,
  `subscribeToNotifications`) with DTOs in `lib/dto/notifications.ts` (`Notification`,
  `createNotificationInput`, `realtimeEventSchema`). Reads are per viewer and never go through
  `remember()`. `markNotificationRead` on someone else's notification answers `NotFoundError` (a read
  of the viewer's own inbox). `ROUTE_NOTIFICATIONS` (`/notifications`) is private by default.
- **`createNotification` is internal:** it has no `requireUser()` because it is called by DAL functions
  after their own checks (`createComment`, once the comment is written, for someone else's post),
  like `maintenance.ts` is for jobs. Never call it from a page, action or Route Handler. It writes the
  row, publishes it, and when Web Push is configured queues a `send-push` job without awaiting it.
- **Adding an event type:** one value in the Prisma `NotificationType` enum (and a migration), the same
  value in `notificationTypeSchema`, and one `createNotification({ userId, type, title, body, url })`
  call where the event happens. `url` must be an app path in the form a browser resolves to itself: the DTO accepts a value only when `safeRedirectPath(value, '') === value`, so `//x`, `/\x`, `/<TAB>/x`, `/.//x` and absolute URLs are rejected.
- **Transport:** `lib/server/realtime.ts` is the seam. `publish(channel, event)` never throws (best
  effort, logged); `subscribe(channel, listener)` returns the unsubscribe function once the channel's
  `SUBSCRIBE` is acknowledged, for every caller (a per-channel entry holds the listener set and the
  shared `SUBSCRIBE` promise); a failed `SUBSCRIBE` rejects every waiting caller and leaves no entry.
  One subscriber connection per process (`getRedisSubscriber()`, separate from `getRedis()`, without a
  command timeout and with `maxRetriesPerRequest: 1`, so a `SUBSCRIBE` against a down Redis fails in
  about a second), `UNSUBSCRIBE` when the last listener leaves.
  Channel names live in `lib/data/channels.ts` (`userChannel(id)` = `realtime:user:<id>`).
- **`GET /api/v1/events`:** `subscribeToNotifications` checks the session (401 JSON before any stream
  exists) and returns the unread count, which is the first message; then every event on the viewer's
  channel is forwarded as `data: <json>`, with a `: ping` comment every 25 s. Headers:
  `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform` (Next's gzip skips
  `no-transform`, so events are not buffered), `X-Accel-Buffering: no`. It ends, and unsubscribes, when
  the request aborts (including an abort that happened while the subscribe was still pending), and
  after 10 minutes at most (`STREAM_MAX_MS`): the session is checked only when a stream opens, and a
  clean end makes `EventSource` reconnect and authenticate again, so a revoked or expired session
  stops receiving within 10 minutes. Route Handlers cannot host WebSockets (see `docs/DECISIONS.md`).
- **Events:** `{ type: 'unread', count }` is authoritative (sent on every connect and after every
  mark-as-read, so every tab self-heals); `{ type: 'notification', notification }` carries the full
  record.
- **Client:** `useRealtime(onEvent)` (`hooks/useRealtime.ts`) is the only consumer of the stream: one
  `EventSource`, events parsed with `realtimeEventSchema`, the latest handler through
  `useEffectEvent`. `EventSource` reconnects by itself only after a network drop or a clean close; a
  non-200 answer (500 while Redis is down, 502 during a deploy) closes it for good, so the hook
  reopens a closed stream with a backoff (1 s, doubling to 30 s, reset on open) and clears the timer
  on unmount. `NotificationBell` (`components/Notifications/Bell`) mounts it for a signed-in
  viewer: badge, toast, and a popover that loads the latest ten through `fetchNotifications`. The
  `(site)` layout seeds the badge with `getUnreadNotificationCount()`.
- **Web Push:** the VAPID trio is optional and all-or-none; without it push is off and
  `getPushConfig()` returns `null`. `lib/server/push.ts` (`sendPush`, `PushGoneError`,
  `isPushConfigured`) is only used by the worker's `send-push` job (`jobs/sendPush.ts`) and by the DAL
  to decide whether to queue it. The handler sends to every `PushSubscription` row of the user
  (`listPushSubscriptions`), deletes a subscription the push service reports gone (404 / 410,
  `PushGoneError`) and rethrows any other failure after the loop so pg-boss retries. A failed send is rethrown as
  `PushSendError(statusCode)`, never the raw `WebPushError` (its endpoint, headers and body would reach
  the worker log). Each request has a 10 s timeout. Endpoints are `https:` only (max 2048 characters),
  and a user keeps at most `MAX_PUSH_SUBSCRIPTIONS_PER_USER` (10) rows: saving an 11th deletes the
  oldest, because the worker sends to every row.
- **Browser side:** `public/sw.js` (served with `Cache-Control: no-cache, no-store` from
  `next.config.ts`) always shows an OS notification, even in a focused tab (the subscription is
  `userVisibleOnly`; Chrome and Safari require one per push and Safari may revoke the subscription
  otherwise), so a focused tab gets the toast and the system notification. A payload that is not
  JSON shows a generic one. On click it focuses a window already at the `url`, else opens one; it
  never navigates an existing tab. The `PushSettings` card on `/settings` registers it
  and stores the subscription through `subscribePushAction` / `unsubscribePushAction`
  (`savePushSubscription` is rate limited per user in the DAL; an endpoint another user held is
  re-owned). The card treats the browser as the source of truth for "enabled": a save that fails
  after the browser subscribed unsubscribes the browser again, and a subscription the browser already
  holds is re-sent once on mount to repair a lost row. `SignOutButton` calls
  `unsubscribeBrowserPush()` (`lib/client/push.ts`) and `unsubscribePushAction(endpoint)` before
  `signOutAction()`, so the next person at that browser does not receive the previous user's
  notifications (session revocation elsewhere does not remove it). The public key reaches the browser as a prop from `getPushConfig()` (page → view →
  card), never as a `NEXT_PUBLIC_` variable.
