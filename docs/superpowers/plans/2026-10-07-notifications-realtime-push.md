# Notifications, SSE Realtime and Web Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-app notifications (table, bell with unread badge, popover, `/notifications` page) delivered live over SSE + Redis pub/sub, with browser Web Push sent by the worker; the first event is "someone commented on your post".

**Architecture:** The DAL (`lib/data/notifications.ts`) writes the row, publishes a `RealtimeEvent` on the user's Redis channel through `lib/server/realtime.ts`, and enqueues a `send-push` job. `GET /api/v1/events` streams `text/event-stream` to the browser (one subscriber Redis connection per process, in-memory fan-out). The worker's `handleSendPush` sends Web Push with `web-push`. The client is one hook (`useRealtime`) and a bell component; a `/settings` card registers `public/sw.js` and stores the push subscription.

**Tech Stack:** Next.js 16.3.8 App Router, React 19, Prisma 7.10, ioredis 6, pg-boss 12, `web-push`, Zod 4, shadcn `popover`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-07-notifications-realtime-push-design.md` — read it first; this plan argues from it.

## Global Constraints

- Read `AGENTS.md` before writing code; every rule there applies (one-contract rule, DAL owns auth and validation, `const` arrow functions, named exports, no Prisma types outside `lib/data`, no `@/lib/server/*` imports outside `lib/data` / `jobs` / `worker` / tests, SCSS modules outside `components/SCN`, no `useMemo`/`useCallback`).
- Package manager is `bun`. Scripts run on Node.
- Prettier: single quotes, no semicolons, trailing commas, 2 spaces, print width 100. Run `bun run format` before each commit.
- Tests: `describe` / `it`, `@/` imports, server tests start with `// @vitest-environment node` and the `next/headers` + `next/cache` mocks shown in Task 4. Server tests need Docker services up (`docker compose up -d`) and `bun run db:test:prepare` after the schema change.
- Nothing in this feature uses `remember()`; every read is per viewer.
- No `remember()`, `'use cache'`, `NEXT_PUBLIC_VAPID_*`, or `fetch` in components. The VAPID public key reaches the browser as a prop from `getPushConfig()`.
- Commit after every task with a conventional prefix (`feat:`, `test:`, `docs:`) and end each message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Before claiming a task done, run the task's listed commands and read their output. At the end of the plan: `bun run typecheck && bun run lint && bun run format:check && bun run test` and one `bun run build` (because `next.config.ts` changes).

---

## File map

| Path | Responsibility |
| --- | --- |
| `prisma/schema.prisma`, `prisma/migrations/*_add_notifications_push/` | `Notification`, `PushSubscription`, `NotificationType` |
| `lib/dto/notifications.ts` | Notification DTOs, list query, URL twin, `createNotificationInput`, `realtimeEventSchema` |
| `lib/dto/push.ts` | `pushSubscriptionInput`, `pushEndpointSchema`, `pushConfigSchema` |
| `lib/sse.ts` | Pure SSE framing helpers |
| `lib/push.ts` | Pure `urlBase64ToUint8Array` for `applicationServerKey` |
| `lib/server/redis.ts` | + `getRedisSubscriber()` |
| `lib/server/realtime.ts` | `publish`, `subscribe` over Redis pub/sub |
| `lib/server/push.ts` | `isPushConfigured`, `getPushPublicKey`, `sendPush`, `PushGoneError` |
| `lib/server/env.ts` | + `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (all or none) |
| `lib/data/channels.ts` | `userChannel(id)` |
| `lib/data/notifications.ts` | `createNotification` (internal), `listNotifications`, `getUnreadNotificationCount`, `markNotificationRead`, `markAllNotificationsRead`, `subscribeToNotifications` |
| `lib/data/push.ts` | `getPushConfig`, `savePushSubscription`, `deletePushSubscription` |
| `lib/data/maintenance.ts` | + `listPushSubscriptions`, `deletePushSubscriptionByEndpoint` |
| `lib/data/comments.ts` | `createComment` notifies the post author |
| `jobs/definitions.ts`, `jobs/sendPush.ts`, `worker/index.ts` | `send-push` job |
| `app/api/v1/events/route.ts` | SSE stream |
| `app/api/v1/notifications/route.ts` | `GET` page of notifications (for the popover) |
| `lib/client/notifications.ts` | `fetchNotifications` facade |
| `actions/notifications.ts`, `actions/push.ts` | Server Actions |
| `hooks/useRealtime.ts` | `EventSource` hook |
| `components/Notifications/{Item,List,MarkAllReadButton,Bell}` | UI leaves |
| `components/Layout/NavBar/index.tsx`, `app/(site)/layout.tsx` | Bell in the nav, initial unread count |
| `app/(site)/notifications/{page,view}.tsx`, `styles.module.scss` | The list page |
| `components/Settings/PushSettings`, `app/(site)/settings/{page,view}.tsx` | Enable / disable browser notifications |
| `public/sw.js`, `next.config.ts`, `eslint.config.mjs` | Service worker, its headers, `web-push` as an external package |
| `lib/constants-routes.ts` | `ROUTE_NOTIFICATIONS` |
| `AGENTS.md`, `docs/DECISIONS.md`, `README.md`, `.env.example`, `.env.test.example`, `docker-compose.yml` | Docs and config |

---

### Task 1: Schema, migration and DTOs

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/dto/notifications.ts`, `lib/dto/push.ts`
- Create: `tests/lib/dto/notifications.test.ts`, `tests/lib/dto/push.test.ts`
- Modify: `lib/constants-routes.ts`

**Interfaces:**
- Produces: `Notification`, `notificationSchema`, `notificationsPageSchema`, `listNotificationsQuery`, `ListNotificationsQuery`, `notificationsUrlQuery`, `createNotificationInput`, `CreateNotificationInput`, `realtimeEventSchema`, `RealtimeEvent`, `NOTIFICATION_*_MAX_LENGTH`; `pushSubscriptionInput`, `PushSubscriptionInput`, `pushEndpointSchema`, `pushConfigSchema`, `PushConfig`; `ROUTE_NOTIFICATIONS`; Prisma models `Notification`, `PushSubscription`.

- [ ] **Step 1: Add the models to `prisma/schema.prisma`**

Add after `enum UploadStatus` (keep the file's enum style) and after the `Comment` model:

```prisma
enum NotificationType {
  comment
}

model Notification {
  id        Int              @id @default(autoincrement())
  /// The recipient.
  userId    String           @map("user_id")
  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      NotificationType
  title     String
  body      String
  /// An app path (`/posts/...`), never an absolute URL.
  url       String
  readAt    DateTime?        @map("read_at") @db.Timestamptz(3)
  createdAt DateTime         @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([userId, readAt])
  @@index([userId, createdAt])
  @@map("notifications")
}

model PushSubscription {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// One browser profile has one endpoint; re-subscribing re-owns the row.
  endpoint  String   @unique
  p256dh    String
  auth      String
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([userId])
  @@map("push_subscriptions")
}
```

Add to `model User`, after `comments      Comment[]`:

```prisma
  notifications     Notification[]
  pushSubscriptions PushSubscription[]
```

- [ ] **Step 2: Create the migration and regenerate**

Run: `bunx prisma migrate dev --name add_notifications_push && bun run db:generate && bun run db:test:prepare`
Expected: a new folder `prisma/migrations/<timestamp>_add_notifications_push/migration.sql` with `CREATE TYPE "NotificationType"`, `CREATE TABLE "notifications"` and `CREATE TABLE "push_subscriptions"`; the test DB is reset and migrated.

- [ ] **Step 3: Write the failing DTO tests**

`tests/lib/dto/notifications.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  createNotificationInput,
  notificationSchema,
  notificationsUrlQuery,
  realtimeEventSchema,
} from '@/lib/dto/notifications'

const notification = {
  id: 1,
  type: 'comment',
  title: 'Casey commented on "Post"',
  body: 'Nice',
  url: '/posts/u1/1',
  readAt: null,
  createdAt: '2026-10-07T10:00:00.000Z',
}

describe('notification DTOs', () => {
  it('revives dates when parsing JSON', () => {
    const parsed = notificationSchema.parse(notification)
    expect(parsed.createdAt).toBeInstanceOf(Date)
    expect(parsed.readAt).toBeNull()
    expect(notificationSchema.parse({ ...notification, readAt: notification.createdAt }).readAt).toBeInstanceOf(Date)
  })

  it('falls back to page 1 for a garbled URL', () => {
    expect(notificationsUrlQuery.parse({ page: 'x' })).toEqual({ page: 1 })
    expect(notificationsUrlQuery.parse({ page: '3' })).toEqual({ page: 3 })
    expect(notificationsUrlQuery.parse({})).toEqual({ page: 1 })
  })

  it('accepts only app paths and bounded text as a notification input', () => {
    const valid = { userId: 'u1', type: 'comment', title: ' T ', body: 'b', url: '/posts/u1/1' }
    expect(createNotificationInput.parse(valid)).toMatchObject({ title: 'T' })
    expect(createNotificationInput.safeParse({ ...valid, url: 'https://evil.example' }).success).toBe(false)
    expect(createNotificationInput.safeParse({ ...valid, url: '//evil.example' }).success).toBe(false)
    expect(createNotificationInput.safeParse({ ...valid, title: '' }).success).toBe(false)
    expect(createNotificationInput.safeParse({ ...valid, title: 'x'.repeat(201) }).success).toBe(false)
    expect(createNotificationInput.safeParse({ ...valid, type: 'other' }).success).toBe(false)
  })

  it('parses realtime events by type', () => {
    expect(realtimeEventSchema.parse({ type: 'unread', count: 2 })).toEqual({ type: 'unread', count: 2 })
    const event = realtimeEventSchema.parse({ type: 'notification', notification })
    expect(event.type === 'notification' && event.notification.createdAt).toBeInstanceOf(Date)
    expect(realtimeEventSchema.safeParse({ type: 'unread', count: -1 }).success).toBe(false)
    expect(realtimeEventSchema.safeParse({ type: 'other' }).success).toBe(false)
  })
})
```

`tests/lib/dto/push.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { pushEndpointSchema, pushSubscriptionInput } from '@/lib/dto/push'

describe('push DTOs', () => {
  it('accepts the shape of PushSubscription.toJSON()', () => {
    const input = {
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'p', auth: 'a' },
      expirationTime: null,
    }
    expect(pushSubscriptionInput.parse(input)).toEqual({
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'p', auth: 'a' },
    })
  })

  it('rejects a non-URL endpoint and empty keys', () => {
    expect(pushSubscriptionInput.safeParse({ endpoint: 'nope', keys: { p256dh: 'p', auth: 'a' } }).success).toBe(false)
    expect(pushSubscriptionInput.safeParse({ endpoint: 'https://p.example', keys: { p256dh: '', auth: 'a' } }).success).toBe(false)
    expect(pushEndpointSchema.safeParse('https://p.example/x').success).toBe(true)
    expect(pushEndpointSchema.safeParse('x').success).toBe(false)
  })
})
```

- [ ] **Step 4: Run them to verify they fail**

Run: `bun run test tests/lib/dto/notifications.test.ts tests/lib/dto/push.test.ts`
Expected: FAIL — cannot resolve `@/lib/dto/notifications` / `@/lib/dto/push`.

- [ ] **Step 5: Write the DTOs**

`lib/dto/notifications.ts`:

```ts
import { z } from 'zod'
import { pageQuerySchema, pageSchema } from './common'
import { userIdSchema } from './users'

export const notificationTypeSchema = z.enum(['comment'])

export type NotificationType = z.infer<typeof notificationTypeSchema>

export const NOTIFICATION_TITLE_MAX_LENGTH = 200
export const NOTIFICATION_BODY_MAX_LENGTH = 500
export const NOTIFICATION_URL_MAX_LENGTH = 500

/** One notification as the recipient sees it. `url` is an app path. */
export const notificationSchema = z.object({
  id: z.number().int(),
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string(),
  url: z.string(),
  readAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
})

export type Notification = z.infer<typeof notificationSchema>

export const notificationsPageSchema = pageSchema(notificationSchema)

export const listNotificationsQuery = pageQuerySchema

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuery>

/** The tolerant URL contract of `/notifications` (see `postsUrlQuery`): any query string parses. */
export const notificationsUrlQuery = z.object({
  page: pageQuerySchema.shape.page.catch(1),
})

/** A same-origin path: starts with one slash, so a notification can never link off-site. */
const appPathSchema = z
  .string()
  .max(NOTIFICATION_URL_MAX_LENGTH)
  .regex(/^\/(?!\/)/, 'Must be an app path')

/** Internal input of `createNotification`: what a DAL function knows after its own checks. */
export const createNotificationInput = z.object({
  userId: userIdSchema,
  type: notificationTypeSchema,
  title: z.string().trim().min(1).max(NOTIFICATION_TITLE_MAX_LENGTH),
  body: z.string().trim().max(NOTIFICATION_BODY_MAX_LENGTH),
  url: appPathSchema,
})

export type CreateNotificationInput = z.infer<typeof createNotificationInput>

/**
 * What travels on a user's realtime channel. `unread` is the authoritative count (sent on every
 * connect and after every mark-as-read, so every tab self-heals); `notification` carries the full
 * record so the bell can show it without a fetch.
 */
export const realtimeEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('unread'), count: z.number().int().nonnegative() }),
  z.object({ type: z.literal('notification'), notification: notificationSchema }),
])

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>
```

`lib/dto/push.ts`:

```ts
import { z } from 'zod'

export const PUSH_ENDPOINT_MAX_LENGTH = 2048
const PUSH_KEY_MAX_LENGTH = 512

export const pushEndpointSchema = z.url().max(PUSH_ENDPOINT_MAX_LENGTH)

/** The relevant part of `PushSubscription.toJSON()`; unknown keys (`expirationTime`) are dropped. */
export const pushSubscriptionInput = z.object({
  endpoint: pushEndpointSchema,
  keys: z.object({
    p256dh: z.string().min(1).max(PUSH_KEY_MAX_LENGTH),
    auth: z.string().min(1).max(PUSH_KEY_MAX_LENGTH),
  }),
})

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInput>

/** What the browser needs to subscribe: the VAPID public key. Present only when push is configured. */
export const pushConfigSchema = z.object({ publicKey: z.string().min(1) })

export type PushConfig = z.infer<typeof pushConfigSchema>
```

Add to `lib/constants-routes.ts` after `ROUTE_ADMIN`:

```ts
export const ROUTE_NOTIFICATIONS = '/notifications'
```

(`/notifications` is private by default: it is not in `PUBLIC_ROUTES`.)

- [ ] **Step 6: Run the tests**

Run: `bun run test tests/lib/dto/notifications.test.ts tests/lib/dto/push.test.ts tests/lib/constants-routes.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
bun run format
git add prisma lib/dto/notifications.ts lib/dto/push.ts lib/constants-routes.ts tests/lib/dto/notifications.test.ts tests/lib/dto/push.test.ts
git commit -m "feat: add notification and push subscription models and DTOs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Redis pub/sub — `lib/server/realtime.ts`

**Files:**
- Modify: `lib/server/redis.ts`
- Create: `lib/server/realtime.ts`, `lib/data/channels.ts`
- Create: `tests/lib/server/realtime.test.ts`

**Interfaces:**
- Consumes: `realtimeEventSchema`, `RealtimeEvent` (Task 1).
- Produces: `getRedisSubscriber(): Redis`; `publish(channel: string, event: RealtimeEvent): Promise<void>`; `subscribe(channel: string, listener: RealtimeListener): Promise<() => void>`; `type RealtimeListener = (event: RealtimeEvent) => void`; `userChannel(id: string): string`.

- [ ] **Step 1: Write the failing test**

`tests/lib/server/realtime.test.ts`:

```ts
// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { publish, subscribe } from '@/lib/server/realtime'
import { getRedis, getRedisSubscriber } from '@/lib/server/redis'
import type { RealtimeEvent } from '@/lib/dto/notifications'
import { resetRedis } from '../../helpers/server'

const CHANNEL = 'realtime:test'

describe('realtime', () => {
  beforeEach(resetRedis)
  afterEach(() => vi.restoreAllMocks())
  afterAll(async () => {
    await getRedisSubscriber().quit()
    await getRedis().quit()
  })

  it('delivers a published event to every listener on the channel', async () => {
    const first: RealtimeEvent[] = []
    const second: RealtimeEvent[] = []
    const unsubscribeFirst = await subscribe(CHANNEL, (event) => first.push(event))
    const unsubscribeSecond = await subscribe(CHANNEL, (event) => second.push(event))

    await publish(CHANNEL, { type: 'unread', count: 2 })

    await vi.waitFor(() => expect(first).toEqual([{ type: 'unread', count: 2 }]))
    expect(second).toEqual([{ type: 'unread', count: 2 }])
    unsubscribeFirst()
    unsubscribeSecond()
  })

  it('revives dates in a notification event', async () => {
    const received: RealtimeEvent[] = []
    const unsubscribe = await subscribe(CHANNEL, (event) => received.push(event))
    const createdAt = new Date('2026-10-07T10:00:00.000Z')
    await publish(CHANNEL, {
      type: 'notification',
      notification: { id: 1, type: 'comment', title: 'T', body: '', url: '/x', readAt: null, createdAt },
    })
    await vi.waitFor(() => expect(received).toHaveLength(1))
    const event = received[0]
    expect(event.type === 'notification' && event.notification.createdAt).toEqual(createdAt)
    unsubscribe()
  })

  it('stops delivering after unsubscribe and drops malformed messages', async () => {
    const received: RealtimeEvent[] = []
    const unsubscribe = await subscribe(CHANNEL, (event) => received.push(event))
    await getRedis().publish(CHANNEL, 'not json')
    await getRedis().publish(CHANNEL, JSON.stringify({ type: 'nope' }))
    await publish(CHANNEL, { type: 'unread', count: 1 })
    await vi.waitFor(() => expect(received).toHaveLength(1))

    unsubscribe()
    await publish(CHANNEL, { type: 'unread', count: 9 })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(received).toHaveLength(1)
  })

  it('never throws from publish when Redis fails', async () => {
    vi.spyOn(getRedis(), 'publish').mockRejectedValueOnce(new Error('down'))
    await expect(publish(CHANNEL, { type: 'unread', count: 1 })).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test tests/lib/server/realtime.test.ts`
Expected: FAIL — cannot resolve `@/lib/server/realtime`.

- [ ] **Step 3: Add the subscriber connection to `lib/server/redis.ts`**

Replace the file's body (keep the header imports and `log`) with:

```ts
import 'server-only'
import Redis, { type RedisOptions } from 'ioredis'
import { serverEnv } from './env'
import { logger } from './logger'

const log = logger.child({ module: 'redis' })

const createClient = (options: RedisOptions) => {
  const client = new Redis(serverEnv().REDIS_URL, {
    lazyConnect: true,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
    ...options,
  })
  // Without a listener, a connection error is an unhandled 'error' event and crashes the process.
  client.on('error', (error) => log.error({ err: error }, 'connection error'))
  return client
}

const globalForRedis = globalThis as unknown as { redis?: Redis; redisSubscriber?: Redis }

/** Shared connection, created on first use so importing this file never needs REDIS_URL. */
export const getRedis = (): Redis => {
  globalForRedis.redis ??= createClient({
    // Redis is an optimization, never a dependency: fail a command fast instead of queueing it
    // behind a reconnect, so callers can fall through to the database.
    maxRetriesPerRequest: 1,
    commandTimeout: 1000,
  })
  return globalForRedis.redis
}

/**
 * The connection that `SUBSCRIBE`s (see `realtime.ts`). A subscribed connection accepts no other
 * command and waits for messages indefinitely, so it is separate from the shared client and has no
 * command timeout. ioredis re-subscribes its channels after a reconnect.
 */
export const getRedisSubscriber = (): Redis => {
  globalForRedis.redisSubscriber ??= createClient({})
  return globalForRedis.redisSubscriber
}
```

- [ ] **Step 4: Write `lib/server/realtime.ts` and `lib/data/channels.ts`**

`lib/server/realtime.ts`:

```ts
import 'server-only'
import { realtimeEventSchema, type RealtimeEvent } from '@/lib/dto/notifications'
import { logger } from './logger'
import { getRedis, getRedisSubscriber } from './redis'

const log = logger.child({ module: 'realtime' })

export type RealtimeListener = (event: RealtimeEvent) => void

// One Redis subscription per channel per process; listeners (open SSE streams) fan out in memory.
const listeners = new Map<string, Set<RealtimeListener>>()
let wired = false

const dispatch = (channel: string, message: string) => {
  const channelListeners = listeners.get(channel)
  if (!channelListeners) {
    return
  }
  let event: RealtimeEvent
  try {
    event = realtimeEventSchema.parse(JSON.parse(message))
  } catch (error) {
    log.error({ err: error, channel }, 'dropped malformed message')
    return
  }
  for (const listener of channelListeners) {
    try {
      listener(event)
    } catch (error) {
      log.error({ err: error, channel }, 'listener failed')
    }
  }
}

const subscriber = () => {
  const client = getRedisSubscriber()
  if (!wired) {
    client.on('message', dispatch)
    wired = true
  }
  return client
}

/** Sends an event to every process subscribed to `channel`. Never throws: realtime is best effort. */
export const publish = async (channel: string, event: RealtimeEvent): Promise<void> => {
  try {
    await getRedis().publish(channel, JSON.stringify(event))
  } catch (error) {
    log.error({ err: error, channel }, 'publish failed')
  }
}

/**
 * Registers `listener` for `channel` and returns the function that removes it. The first listener
 * on a channel subscribes the process to it (awaited, so no event published after this resolves
 * is missed); the last one leaving unsubscribes. A failed `SUBSCRIBE` propagates, so the caller
 * (the events route) fails and the browser's `EventSource` retries.
 */
export const subscribe = async (
  channel: string,
  listener: RealtimeListener,
): Promise<() => void> => {
  let channelListeners = listeners.get(channel)
  if (!channelListeners) {
    channelListeners = new Set()
    listeners.set(channel, channelListeners)
    try {
      await subscriber().subscribe(channel)
    } catch (error) {
      listeners.delete(channel)
      throw error
    }
  }
  channelListeners.add(listener)
  return () => {
    const current = listeners.get(channel)
    if (!current?.delete(listener) || current.size > 0) {
      return
    }
    listeners.delete(channel)
    subscriber()
      .unsubscribe(channel)
      .catch((error) => log.error({ err: error, channel }, 'unsubscribe failed'))
  }
}
```

`lib/data/channels.ts`:

```ts
import 'server-only'

/** The realtime channel of one user: their notifications and unread count. */
export const userChannel = (id: string) => `realtime:user:${id}`
```

- [ ] **Step 5: Run the tests**

Run: `bun run test tests/lib/server/realtime.test.ts tests/lib/server/cache.test.ts tests/lib/data/rateLimit.test.ts`
Expected: PASS (the existing Redis users still work with the refactored `createClient`).

- [ ] **Step 6: Commit**

```bash
bun run format
git add lib/server/redis.ts lib/server/realtime.ts lib/data/channels.ts tests/lib/server/realtime.test.ts
git commit -m "feat: add Redis pub/sub realtime channel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Env trio and `lib/server/push.ts`

**Files:**
- Modify: `lib/server/env.ts`, `tests/lib/server/env.test.ts`, `.env.example`, `.env.test.example`, `docker-compose.yml`, `next.config.ts`
- Create: `lib/server/push.ts`, `tests/lib/server/push.test.ts`

**Interfaces:**
- Produces: `serverEnv().VAPID_PUBLIC_KEY | VAPID_PRIVATE_KEY | VAPID_SUBJECT` (`string | undefined`); `isPushConfigured(): boolean`; `getPushPublicKey(): string | null`; `sendPush(target: PushTarget, payload: PushPayload): Promise<void>`; `class PushGoneError extends Error { endpoint: string }`; `type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } }`; `type PushPayload = { title: string; body: string; url: string }`.

- [ ] **Step 1: Install `web-push`**

Run: `bun add web-push && bun add -d @types/web-push`
Expected: both appear in `package.json`; `bun.lock` updated.

- [ ] **Step 2: Write the failing env tests**

In `tests/lib/server/env.test.ts`, add `VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined, VAPID_SUBJECT: undefined` to the defaults object inside `stubEnv` (next to `GOOGLE_CLIENT_SECRET: undefined`), and append inside `describe('serverEnv')`:

```ts
  it('treats the VAPID trio as optional, all or none', () => {
    stubEnv(valid)
    expect(serverEnv().VAPID_PUBLIC_KEY).toBeUndefined()
    resetServerEnv()
    stubEnv({ ...valid, VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:a@b.co' })
    expect(serverEnv().VAPID_SUBJECT).toBe('mailto:a@b.co')
    resetServerEnv()
    stubEnv({ ...valid, VAPID_PUBLIC_KEY: 'pub' })
    expect(() => serverEnv()).toThrow(/VAPID_PUBLIC_KEY/)
    resetServerEnv()
    stubEnv({ ...valid, VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'a@b.co' })
    expect(() => serverEnv()).toThrow(/VAPID_SUBJECT/)
  })
```

- [ ] **Step 3: Write the failing push tests**

`tests/lib/server/push.test.ts`:

```ts
// @vitest-environment node
import webpush from 'web-push'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetServerEnv } from '@/lib/server/env'
import { isPushConfigured, getPushPublicKey, PushGoneError, sendPush } from '@/lib/server/push'

vi.mock('web-push', () => {
  class WebPushError extends Error {
    constructor(
      message: string,
      readonly statusCode: number,
    ) {
      super(message)
    }
  }
  return {
    default: { setVapidDetails: vi.fn(), sendNotification: vi.fn(async () => ({})), WebPushError },
  }
})

const target = { endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } }
const payload = { title: 'T', body: 'B', url: '/posts/u/1' }

describe('push', () => {
  beforeEach(() => {
    resetServerEnv()
    vi.stubEnv('VAPID_PUBLIC_KEY', 'pub')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'priv')
    vi.stubEnv('VAPID_SUBJECT', 'mailto:a@b.co')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    resetServerEnv()
    vi.mocked(webpush.sendNotification).mockClear()
  })

  it('reports whether push is configured and exposes the public key', () => {
    expect(isPushConfigured()).toBe(true)
    expect(getPushPublicKey()).toBe('pub')
    resetServerEnv()
    vi.stubEnv('VAPID_PUBLIC_KEY', '')
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    vi.stubEnv('VAPID_SUBJECT', '')
    expect(isPushConfigured()).toBe(false)
    expect(getPushPublicKey()).toBeNull()
  })

  it('sends the JSON payload to the subscription', async () => {
    await sendPush(target, payload)
    expect(webpush.setVapidDetails).toHaveBeenCalledWith('mailto:a@b.co', 'pub', 'priv')
    expect(webpush.sendNotification).toHaveBeenCalledWith(target, JSON.stringify(payload), {
      TTL: 3600,
    })
  })

  it('maps 404 and 410 to PushGoneError and lets other failures propagate', async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(new webpush.WebPushError('gone', 410))
    await expect(sendPush(target, payload)).rejects.toBeInstanceOf(PushGoneError)
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(new webpush.WebPushError('nf', 404))
    await expect(sendPush(target, payload)).rejects.toMatchObject({ endpoint: target.endpoint })
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(new webpush.WebPushError('busy', 500))
    await expect(sendPush(target, payload)).rejects.not.toBeInstanceOf(PushGoneError)
  })

  it('refuses to send when push is not configured', async () => {
    resetServerEnv()
    vi.stubEnv('VAPID_PUBLIC_KEY', '')
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    vi.stubEnv('VAPID_SUBJECT', '')
    await expect(sendPush(target, payload)).rejects.toThrow(/not configured/)
  })
})
```

Note: `web-push`'s real `WebPushError` constructor is `(message, statusCode, headers, body, endpoint)`; the mock keeps the two fields the code reads.

- [ ] **Step 4: Run both to verify they fail**

Run: `bun run test tests/lib/server/env.test.ts tests/lib/server/push.test.ts`
Expected: env test FAIL on the VAPID case; push test FAIL (module missing).

- [ ] **Step 5: Extend `lib/server/env.ts`**

Add inside the `z.object({ ... })`, after `GOOGLE_CLIENT_SECRET`:

```ts
    // Optional trio: Web Push is on only when all three are set (`bunx web-push generate-vapid-keys`).
    // `VAPID_SUBJECT` is the contact the push services may use: a mailto: or https: URL.
    VAPID_PUBLIC_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    VAPID_PRIVATE_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    VAPID_SUBJECT: z.preprocess(
      emptyToUndefined,
      z.string().regex(/^(mailto:|https:)/, 'Must start with mailto: or https:').optional(),
    ),
```

Chain a second `.refine` after the Google one:

```ts
  .refine(
    (env) => {
      const set = [env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT].filter(Boolean)
      return set.length === 0 || set.length === 3
    },
    {
      message: 'Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT together, or none',
      path: ['VAPID_PUBLIC_KEY'],
    },
  )
```

- [ ] **Step 6: Write `lib/server/push.ts`**

```ts
import 'server-only'
import webpush from 'web-push'
import { serverEnv } from './env'

export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } }

/** What `public/sw.js` reads from a push message. */
export type PushPayload = { title: string; body: string; url: string }

/** Seconds a push service keeps an undelivered message. */
const PUSH_TTL_SECONDS = 60 * 60

/** The push service no longer knows the subscription (404 / 410): drop it, do not retry. */
export class PushGoneError extends Error {
  constructor(readonly endpoint: string) {
    super('Push subscription is gone')
    this.name = 'PushGoneError'
  }
}

/** Web Push is on only when the VAPID trio is set (`serverEnv()` rejects a partial trio). */
export const isPushConfigured = (): boolean => serverEnv().VAPID_PRIVATE_KEY !== undefined

export const getPushPublicKey = (): string | null => serverEnv().VAPID_PUBLIC_KEY ?? null

let configured = false

const configure = () => {
  if (configured) {
    return
  }
  const env = serverEnv()
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    throw new Error('Web Push is not configured: set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT')
  }
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
  configured = true
}

/** Sends one push message. Only the worker calls this (the `send-push` job). */
export const sendPush = async (target: PushTarget, payload: PushPayload): Promise<void> => {
  configure()
  try {
    await webpush.sendNotification(target, JSON.stringify(payload), { TTL: PUSH_TTL_SECONDS })
  } catch (error) {
    if (
      error instanceof webpush.WebPushError &&
      (error.statusCode === 404 || error.statusCode === 410)
    ) {
      throw new PushGoneError(target.endpoint)
    }
    throw error
  }
}
```

The `configured` flag is module state, so the push test's "not configured" case must run after `resetServerEnv()` has cleared the env **and** before any successful send in that test file — the test above puts it last, and `configure()` re-reads `serverEnv()` only until the first success. If this ordering is fragile in practice, export a `resetPushConfig = () => { configured = false }` for tests and call it in `beforeEach`.

- [ ] **Step 7: Config files**

`next.config.ts`: add `serverExternalPackages: ['web-push']` to `nextConfig` (web-push is a Node package with its own HTTP client; it is loaded by the web process only to read `isPushConfigured()`).

`.env.example`, append:

```
# Web Push (optional; set all three or none). Generate the keys with `bunx web-push generate-vapid-keys`.
# VAPID_SUBJECT is a mailto: or https: contact for the push services. Tests never need them.
# VAPID_PUBLIC_KEY=""
# VAPID_PRIVATE_KEY=""
# VAPID_SUBJECT="mailto:you@example.com"
```

`.env.test.example`: append the same three lines, commented out.

`docker-compose.yml`, in `x-app-env` after the Google pair:

```yaml
  # Web Push is on only when all three are set (see .env.example).
  VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY:-}
  VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY:-}
  VAPID_SUBJECT: ${VAPID_SUBJECT:-}
```

- [ ] **Step 8: Run the tests**

Run: `bun run test tests/lib/server/env.test.ts tests/lib/server/push.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
bun run format
git add package.json bun.lock lib/server/env.ts lib/server/push.ts next.config.ts .env.example .env.test.example docker-compose.yml tests/lib/server/env.test.ts tests/lib/server/push.test.ts
git commit -m "feat: add web-push sender and VAPID configuration

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Notifications DAL

**Files:**
- Create: `lib/data/notifications.ts`
- Create: `tests/lib/data/notifications.test.ts`

**Interfaces:**
- Consumes: Task 1 DTOs, `publish` / `subscribe` / `RealtimeListener` (Task 2), `isPushConfigured` (Task 3), `enqueue` (`lib/server/queue.ts`; the `'send-push'` job name is added in Task 6 — until then TypeScript rejects it, so Task 6's definition is added here as part of this task, see Step 3).
- Produces: `createNotification(input: CreateNotificationInput): Promise<Notification>` (internal, no auth); `listNotifications(query: ListNotificationsQuery): Promise<Page<Notification>>`; `getUnreadNotificationCount(): Promise<number>`; `markNotificationRead(id: number | string): Promise<Notification>`; `markAllNotificationsRead(): Promise<number>`; `subscribeToNotifications(listener: RealtimeListener): Promise<{ unreadCount: number; unsubscribe: () => void }>`.

- [ ] **Step 1: Write the failing test**

`tests/lib/data/notifications.test.ts`:

```ts
// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import { NotFoundError, UnauthorizedError, ValidationError } from '@/lib/data/errors'
import {
  createNotification,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
} from '@/lib/data/notifications'
import { userChannel } from '@/lib/data/channels'
import type { RealtimeEvent } from '@/lib/dto/notifications'
import { isPushConfigured } from '@/lib/server/push'
import { enqueue } from '@/lib/server/queue'
import { publish, subscribe } from '@/lib/server/realtime'
import { getRedis, getRedisSubscriber } from '@/lib/server/redis'
import { createUser, resetDatabase, signInAs, signOut } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/server/push', () => ({ isPushConfigured: vi.fn(() => false) }))

const input = (userId: string, overrides: Partial<{ title: string; body: string }> = {}) => ({
  userId,
  type: 'comment' as const,
  title: overrides.title ?? 'Casey commented on "Post"',
  body: overrides.body ?? 'Nice',
  url: `/posts/${userId}/1`,
})

describe('notifications DAL', () => {
  beforeEach(resetDatabase)
  afterEach(() => {
    vi.restoreAllMocks()
    vi.mocked(enqueue).mockClear()
    vi.mocked(isPushConfigured).mockReturnValue(false)
  })
  afterAll(async () => {
    await getRedisSubscriber().quit()
    await getRedis().quit()
    await db.$disconnect()
  })

  describe('createNotification', () => {
    it('inserts, publishes the record on the recipient channel, and needs no session', async () => {
      const user = await createUser({})
      signOut()
      const received: RealtimeEvent[] = []
      const unsubscribe = await subscribe(userChannel(user.id), (event) => received.push(event))

      const notification = await createNotification(input(user.id))

      expect(notification).toMatchObject({ type: 'comment', readAt: null, url: `/posts/${user.id}/1` })
      expect(notification.createdAt).toBeInstanceOf(Date)
      await vi.waitFor(() => expect(received).toHaveLength(1))
      expect(received[0]).toEqual({ type: 'notification', notification })
      expect(enqueue).not.toHaveBeenCalled()
      unsubscribe()
    })

    it('queues a push only when push is configured', async () => {
      const user = await createUser({})
      vi.mocked(isPushConfigured).mockReturnValue(true)
      await createNotification(input(user.id))
      await vi.waitFor(() =>
        expect(enqueue).toHaveBeenCalledWith('send-push', {
          userId: user.id,
          title: 'Casey commented on "Post"',
          body: 'Nice',
          url: `/posts/${user.id}/1`,
        }),
      )
    })

    it('validates its input', async () => {
      const user = await createUser({})
      await expect(createNotification({ ...input(user.id), url: 'https://x' })).rejects.toBeInstanceOf(ValidationError)
      expect(await db.notification.count()).toBe(0)
    })
  })

  describe('reads', () => {
    it('lists the viewer’s own notifications newest first, paginated, and counts unread', async () => {
      const me = await createUser({})
      const other = await createUser({})
      await createNotification(input(me.id, { title: 'first' }))
      await createNotification(input(me.id, { title: 'second' }))
      await createNotification(input(other.id, { title: 'theirs' }))

      signOut()
      await expect(listNotifications({ page: 1, perPage: 10 })).rejects.toBeInstanceOf(UnauthorizedError)
      await expect(getUnreadNotificationCount()).rejects.toBeInstanceOf(UnauthorizedError)

      await signInAs(me)
      const page = await listNotifications({ page: 1, perPage: 1 })
      expect(page).toMatchObject({ page: 1, perPage: 1, totalItems: 2, totalPages: 2 })
      expect(page.items.map((item) => item.title)).toEqual(['second'])
      expect((await listNotifications({ page: 2, perPage: 1 })).items[0].title).toBe('first')
      expect(await getUnreadNotificationCount()).toBe(2)
      await expect(listNotifications({ page: 0, perPage: 1 })).rejects.toBeInstanceOf(ValidationError)
    })
  })

  describe('marking read', () => {
    it('marks one of the viewer’s notifications read and publishes the new unread count', async () => {
      const me = await createUser({})
      const other = await createUser({})
      const mine = await createNotification(input(me.id))
      await createNotification(input(me.id))
      const theirs = await createNotification(input(other.id))
      await signInAs(me)
      const received: RealtimeEvent[] = []
      const unsubscribe = await subscribe(userChannel(me.id), (event) => received.push(event))

      const updated = await markNotificationRead(mine.id)
      expect(updated.readAt).toBeInstanceOf(Date)
      expect(await getUnreadNotificationCount()).toBe(1)
      await vi.waitFor(() => expect(received).toContainEqual({ type: 'unread', count: 1 }))

      // Already read: idempotent, no second publish.
      const again = await markNotificationRead(mine.id)
      expect(again.readAt).toEqual(updated.readAt)

      // Someone else’s, a missing id and a malformed id are all "not found".
      await expect(markNotificationRead(theirs.id)).rejects.toBeInstanceOf(NotFoundError)
      await expect(markNotificationRead(999)).rejects.toBeInstanceOf(NotFoundError)
      await expect(markNotificationRead('abc')).rejects.toBeInstanceOf(NotFoundError)
      signOut()
      await expect(markNotificationRead(mine.id)).rejects.toBeInstanceOf(UnauthorizedError)
      unsubscribe()
    })

    it('marks all read and publishes zero', async () => {
      const me = await createUser({})
      await createNotification(input(me.id))
      await createNotification(input(me.id))
      await signInAs(me)
      const received: RealtimeEvent[] = []
      const unsubscribe = await subscribe(userChannel(me.id), (event) => received.push(event))

      expect(await markAllNotificationsRead()).toBe(2)
      expect(await getUnreadNotificationCount()).toBe(0)
      await vi.waitFor(() => expect(received).toContainEqual({ type: 'unread', count: 0 }))
      expect(await markAllNotificationsRead()).toBe(0)
      unsubscribe()
    })
  })

  describe('subscribeToNotifications', () => {
    it('requires a session, returns the unread count and delivers the viewer’s events only', async () => {
      const me = await createUser({})
      const other = await createUser({})
      await createNotification(input(me.id))
      signOut()
      await expect(subscribeToNotifications(() => {})).rejects.toBeInstanceOf(UnauthorizedError)

      await signInAs(me)
      const received: RealtimeEvent[] = []
      const { unreadCount, unsubscribe } = await subscribeToNotifications((event) => received.push(event))
      expect(unreadCount).toBe(1)
      await publish(userChannel(other.id), { type: 'unread', count: 7 })
      await publish(userChannel(me.id), { type: 'unread', count: 3 })
      await vi.waitFor(() => expect(received).toEqual([{ type: 'unread', count: 3 }]))
      unsubscribe()
    })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test tests/lib/data/notifications.test.ts`
Expected: FAIL — cannot resolve `@/lib/data/notifications`.

- [ ] **Step 3: Add the job definition (so `enqueue('send-push', …)` type-checks)**

In `jobs/definitions.ts`, add `import { userIdSchema } from '@/lib/dto/users'` and a new entry in `jobs` after `'delete-object'`:

```ts
  'send-push': {
    schema: z.object({
      userId: userIdSchema,
      title: z.string().min(1),
      body: z.string(),
      url: z.string().min(1),
    }),
    options: { retryLimit: 2, retryDelay: 30, retryBackoff: true, expireInSeconds: 60 },
  },
```

- [ ] **Step 4: Write `lib/data/notifications.ts`**

```ts
import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { idSchema, toPage, type Page } from '@/lib/dto/common'
import {
  createNotificationInput,
  listNotificationsQuery,
  type CreateNotificationInput,
  type ListNotificationsQuery,
  type Notification,
} from '@/lib/dto/notifications'
import { logger } from '@/lib/server/logger'
import { isPushConfigured } from '@/lib/server/push'
import { enqueue } from '@/lib/server/queue'
import { publish, subscribe, type RealtimeListener } from '@/lib/server/realtime'
import { requireUser } from './auth'
import { userChannel } from './channels'
import { db } from './db'
import { NotFoundError, parseInput } from './errors'

const log = logger.child({ module: 'notifications' })

/** Selects exactly the `Notification` DTO; the row is the DTO, so drift fails to compile. */
const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  url: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>

const toNotification = (row: NotificationRow): Notification => row

const countUnread = (userId: string) => {
  return db.notification.count({ where: { userId, readAt: null } })
}

const publishUnread = async (userId: string) => {
  await publish(userChannel(userId), { type: 'unread', count: await countUnread(userId) })
}

/**
 * Internal: no `requireUser()`. It is called by DAL functions after their own checks (e.g.
 * `createComment` once the comment is written), never from a page, action or handler. Writes the
 * row, publishes it on the recipient's channel (best effort) and, when Web Push is configured,
 * queues a push without waiting for it.
 */
export const createNotification = async (
  input: CreateNotificationInput,
): Promise<Notification> => {
  const data = parseInput(createNotificationInput, input)
  const row = await db.notification.create({ data, select: notificationSelect })
  const notification = toNotification(row)
  await publish(userChannel(data.userId), { type: 'notification', notification })
  if (isPushConfigured()) {
    const { userId, title, body, url } = data
    enqueue('send-push', { userId, title, body, url }).catch((error) => {
      log.error({ err: error, notificationId: row.id }, 'push not queued')
    })
  }
  return notification
}

/** The viewer's notifications, newest first. Never cached: it is per viewer. */
export const listNotifications = async (
  query: ListNotificationsQuery,
): Promise<Page<Notification>> => {
  const viewer = await requireUser()
  const { page, perPage } = parseInput(listNotificationsQuery, query)
  const where = { userId: viewer.id }
  const [rows, totalItems] = await Promise.all([
    db.notification.findMany({
      where,
      select: notificationSelect,
      orderBy: { id: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.notification.count({ where }),
  ])
  return toPage(rows.map(toNotification), totalItems, { page, perPage })
}

export const getUnreadNotificationCount = async (): Promise<number> => {
  const viewer = await requireUser()
  return countUnread(viewer.id)
}

/**
 * Signed in (401) → the notification is the viewer's (404: it is a read of their own inbox, so
 * someone else's looks missing). Already read is a no-op. Publishes the new count so other tabs
 * follow.
 */
export const markNotificationRead = async (id: number | string): Promise<Notification> => {
  const viewer = await requireUser()
  const parsed = idSchema.safeParse(id)
  const row = parsed.success
    ? await db.notification.findFirst({
        where: { id: parsed.data, userId: viewer.id },
        select: notificationSelect,
      })
    : null
  if (!row) {
    throw new NotFoundError('Notification not found')
  }
  if (row.readAt) {
    return toNotification(row)
  }
  const readAt = new Date()
  await db.notification.updateMany({ where: { id: row.id, readAt: null }, data: { readAt } })
  await publishUnread(viewer.id)
  return { ...toNotification(row), readAt }
}

/** Marks every unread notification of the viewer read; returns how many changed. */
export const markAllNotificationsRead = async (): Promise<number> => {
  const viewer = await requireUser()
  const { count } = await db.notification.updateMany({
    where: { userId: viewer.id, readAt: null },
    data: { readAt: new Date() },
  })
  if (count > 0) {
    await publishUnread(viewer.id)
  }
  return count
}

/**
 * Attaches `listener` to the viewer's channel (401 when signed out) and returns the current
 * unread count with it, so the events route can open a stream with one auth check. The caller
 * must call `unsubscribe` when the stream ends.
 */
export const subscribeToNotifications = async (
  listener: RealtimeListener,
): Promise<{ unreadCount: number; unsubscribe: () => void }> => {
  const viewer = await requireUser()
  const unsubscribe = await subscribe(userChannel(viewer.id), listener)
  try {
    return { unreadCount: await countUnread(viewer.id), unsubscribe }
  } catch (error) {
    unsubscribe()
    throw error
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `bun run test tests/lib/data/notifications.test.ts tests/jobs/definitions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
bun run format
git add lib/data/notifications.ts jobs/definitions.ts tests/lib/data/notifications.test.ts
git commit -m "feat: add notifications DAL with realtime publish and push enqueue

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `createComment` notifies the post author

**Files:**
- Modify: `lib/data/comments.ts:85-114`
- Modify: `tests/lib/data/comments.test.ts` (inside `describe('createComment')`)

**Interfaces:**
- Consumes: `createNotification` (Task 4), `ROUTE_POST_DETAILS` (`lib/constants-routes.ts`), `NOTIFICATION_BODY_MAX_LENGTH`.

- [ ] **Step 1: Write the failing test**

Add to `tests/lib/data/comments.test.ts` imports: `import { enqueue } from '@/lib/server/queue'` is not needed; add `import { ROUTE_POST_DETAILS } from '@/lib/constants-routes'`. Inside `describe('createComment')` append:

```ts
    it('notifies the post author, but not for a comment on their own post', async () => {
      const author = await createUser({})
      const commenter = await createUser({ name: 'Casey' })
      const post = await db.post.create({
        data: { userId: author.id, title: 'My post', body: 'Body', status: 'published' },
      })

      await signInAs(commenter)
      await createComment(post.id, { body: 'Nice one' })
      const [notification] = await db.notification.findMany({ where: { userId: author.id } })
      expect(notification).toMatchObject({
        type: 'comment',
        title: 'Casey commented on "My post"',
        body: 'Nice one',
        url: ROUTE_POST_DETAILS(author.id, post.id),
        readAt: null,
      })

      await signInAs(author)
      await createComment(post.id, { body: 'Thanks' })
      expect(await db.notification.count()).toBe(1)
    })

    it('truncates a long comment in the notification body', async () => {
      const author = await createUser({})
      const commenter = await createUser({})
      const post = await db.post.create({
        data: { userId: author.id, title: 'P', body: 'B', status: 'published' },
      })
      await signInAs(commenter)
      await createComment(post.id, { body: 'x'.repeat(600) })
      const [notification] = await db.notification.findMany({ where: { userId: author.id } })
      expect(notification.body).toHaveLength(140)
      expect(notification.body.endsWith('…')).toBe(true)
    })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test tests/lib/data/comments.test.ts -t "notifies the post author"`
Expected: FAIL — `notification` is undefined (no row).

- [ ] **Step 3: Implement**

In `lib/data/comments.ts`:

- Add imports: `import { ROUTE_POST_DETAILS } from '@/lib/constants-routes'` and `import { createNotification } from './notifications'`.
- Add near the top constants:

```ts
/** How much of the comment the notification shows. */
const NOTIFICATION_EXCERPT_LENGTH = 140

const excerpt = (text: string) => {
  return text.length > NOTIFICATION_EXCERPT_LENGTH
    ? `${text.slice(0, NOTIFICATION_EXCERPT_LENGTH - 1)}…`
    : text
}
```

- In `createComment`, change the post select to `select: { userId: true, status: true, title: true }`, and after `await invalidateComments(id)` add:

```ts
  // The author hears about other people's comments; their own need no notification.
  if (post.userId !== viewer.id) {
    await createNotification({
      userId: post.userId,
      type: 'comment',
      title: `${row.user.name} commented on "${post.title}"`,
      body: excerpt(body),
      url: ROUTE_POST_DETAILS(post.userId, id),
    })
  }
```

Update the doc comment of `createComment` to mention the notification. Note `createNotificationInput` caps the title at 200 characters; a post title is at most `TITLE_MAX_LENGTH` (check `lib/dto/posts.ts`) plus a name — if the sum can exceed 200, truncate the title with `excerpt`-style logic to `NOTIFICATION_TITLE_MAX_LENGTH` instead of letting `parseInput` throw. Verify the maximums and handle it.

- [ ] **Step 4: Run the tests**

Run: `bun run test tests/lib/data/comments.test.ts`
Expected: PASS, including the existing cases.

- [ ] **Step 5: Commit**

```bash
bun run format
git add lib/data/comments.ts tests/lib/data/comments.test.ts
git commit -m "feat: notify the post author of new comments

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Push subscriptions DAL, maintenance functions, `send-push` job

**Files:**
- Create: `lib/data/push.ts`, `jobs/sendPush.ts`
- Modify: `lib/data/maintenance.ts`, `worker/index.ts`, `tests/jobs/definitions.test.ts`
- Create: `tests/lib/data/push.test.ts`, `tests/jobs/sendPush.test.ts`

**Interfaces:**
- Consumes: `pushSubscriptionInput`, `pushEndpointSchema`, `PushConfig` (Task 1); `getPushPublicKey`, `sendPush`, `PushGoneError`, `PushTarget` (Task 3); `jobs['send-push']` (Task 4 Step 3).
- Produces: `getPushConfig(): PushConfig | null`; `savePushSubscription(input: PushSubscriptionInput): Promise<void>`; `deletePushSubscription(endpoint: string): Promise<void>`; `listPushSubscriptions(userId: string): Promise<PushTarget[]>`; `deletePushSubscriptionByEndpoint(endpoint: string): Promise<void>`; `handleSendPush(payload: unknown): Promise<void>`.

- [ ] **Step 1: Write the failing DAL test**

`tests/lib/data/push.test.ts`:

```ts
// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import { UnauthorizedError, ValidationError } from '@/lib/data/errors'
import { deletePushSubscriptionByEndpoint, listPushSubscriptions } from '@/lib/data/maintenance'
import { deletePushSubscription, getPushConfig, savePushSubscription } from '@/lib/data/push'
import { getPushPublicKey } from '@/lib/server/push'
import { getRedis } from '@/lib/server/redis'
import { createUser, resetDatabase, signInAs, signOut } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/server/push', () => ({ getPushPublicKey: vi.fn(() => null) }))

const subscription = (endpoint = 'https://push.example/a') => ({
  endpoint,
  keys: { p256dh: 'p', auth: 'a' },
})

describe('push DAL', () => {
  beforeEach(resetDatabase)
  afterEach(() => vi.mocked(getPushPublicKey).mockReturnValue(null))
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

  it('exposes the public key only when configured', () => {
    expect(getPushConfig()).toBeNull()
    vi.mocked(getPushPublicKey).mockReturnValue('pub')
    expect(getPushConfig()).toEqual({ publicKey: 'pub' })
  })

  it('saves the viewer’s subscription, re-owning an endpoint another user had', async () => {
    const first = await createUser({})
    const second = await createUser({})
    signOut()
    await expect(savePushSubscription(subscription())).rejects.toBeInstanceOf(UnauthorizedError)

    await signInAs(first)
    await expect(savePushSubscription({ ...subscription(), endpoint: 'x' })).rejects.toBeInstanceOf(ValidationError)
    await savePushSubscription(subscription())
    await savePushSubscription(subscription())
    expect(await db.pushSubscription.count()).toBe(1)

    await signInAs(second)
    await savePushSubscription({ ...subscription(), keys: { p256dh: 'p2', auth: 'a2' } })
    const rows = await db.pushSubscription.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ userId: second.id, p256dh: 'p2' })
  })

  it('deletes only the viewer’s own subscription and ignores a missing one', async () => {
    const owner = await createUser({})
    const other = await createUser({})
    await signInAs(owner)
    await savePushSubscription(subscription())
    await signInAs(other)
    await deletePushSubscription('https://push.example/a')
    expect(await db.pushSubscription.count()).toBe(1)
    await signInAs(owner)
    await deletePushSubscription('https://push.example/a')
    await deletePushSubscription('https://push.example/a')
    expect(await db.pushSubscription.count()).toBe(0)
    signOut()
    await expect(deletePushSubscription('https://push.example/a')).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('maintenance lists a user’s targets and deletes by endpoint without a viewer', async () => {
    const user = await createUser({})
    await signInAs(user)
    await savePushSubscription(subscription('https://push.example/1'))
    await savePushSubscription(subscription('https://push.example/2'))
    signOut()
    const targets = await listPushSubscriptions(user.id)
    expect(targets.map((target) => target.endpoint).sort()).toEqual([
      'https://push.example/1',
      'https://push.example/2',
    ])
    expect(targets[0].keys).toEqual({ p256dh: 'p', auth: 'a' })
    await deletePushSubscriptionByEndpoint('https://push.example/1')
    expect(await listPushSubscriptions(user.id)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Write the failing job test**

`tests/jobs/sendPush.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleSendPush } from '@/jobs/sendPush'
import { deletePushSubscriptionByEndpoint, listPushSubscriptions } from '@/lib/data/maintenance'
import { PushGoneError, sendPush } from '@/lib/server/push'

vi.mock('@/lib/data/maintenance', () => ({
  listPushSubscriptions: vi.fn(async () => []),
  deletePushSubscriptionByEndpoint: vi.fn(async () => {}),
}))
vi.mock('@/lib/server/push', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/push')>('@/lib/server/push')
  return { ...actual, sendPush: vi.fn(async () => {}) }
})

const payload = { userId: 'u1', title: 'T', body: 'B', url: '/posts/u1/1' }
const target = (n: number) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: 'p', auth: 'a' } })

describe('send-push job', () => {
  afterEach(() => {
    vi.mocked(sendPush).mockReset().mockResolvedValue()
    vi.mocked(listPushSubscriptions).mockReset().mockResolvedValue([])
    vi.mocked(deletePushSubscriptionByEndpoint).mockClear()
  })

  it('sends the payload to each of the user’s subscriptions', async () => {
    vi.mocked(listPushSubscriptions).mockResolvedValue([target(1), target(2)])
    await handleSendPush(payload)
    expect(listPushSubscriptions).toHaveBeenCalledWith('u1')
    expect(sendPush).toHaveBeenCalledTimes(2)
    expect(sendPush).toHaveBeenCalledWith(target(1), { title: 'T', body: 'B', url: '/posts/u1/1' })
  })

  it('does nothing when the user has no subscriptions', async () => {
    await handleSendPush(payload)
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('re-validates the payload', async () => {
    await expect(handleSendPush({ ...payload, userId: '' })).rejects.toThrow()
    await expect(handleSendPush(null)).rejects.toThrow()
  })

  it('drops a subscription the push service no longer knows and finishes the others', async () => {
    vi.mocked(listPushSubscriptions).mockResolvedValue([target(1), target(2)])
    vi.mocked(sendPush).mockImplementation(async (t) => {
      if (t.endpoint.endsWith('/1')) {
        throw new PushGoneError(t.endpoint)
      }
    })
    await handleSendPush(payload)
    expect(deletePushSubscriptionByEndpoint).toHaveBeenCalledWith('https://push.example/1')
    expect(deletePushSubscriptionByEndpoint).toHaveBeenCalledTimes(1)
  })

  it('lets any other failure propagate after the loop so pg-boss retries', async () => {
    vi.mocked(listPushSubscriptions).mockResolvedValue([target(1), target(2)])
    vi.mocked(sendPush).mockImplementation(async (t) => {
      if (t.endpoint.endsWith('/1')) {
        throw new Error('push service down')
      }
    })
    await expect(handleSendPush(payload)).rejects.toThrow('push service down')
    expect(sendPush).toHaveBeenCalledTimes(2)
    expect(deletePushSubscriptionByEndpoint).not.toHaveBeenCalled()
  })
})
```

Also add to `tests/jobs/definitions.test.ts` a case in the existing style:

```ts
  it('validates the send-push payload', () => {
    const schema = jobs['send-push'].schema
    expect(schema.safeParse({ userId: 'u1', title: 'T', body: '', url: '/x' }).success).toBe(true)
    expect(schema.safeParse({ userId: 'u1', title: '', body: '', url: '/x' }).success).toBe(false)
    expect(schema.safeParse({ userId: 'u1', title: 'T', body: '' }).success).toBe(false)
  })
```

- [ ] **Step 3: Run them to verify they fail**

Run: `bun run test tests/lib/data/push.test.ts tests/jobs/sendPush.test.ts tests/jobs/definitions.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 4: Write `lib/data/push.ts`**

```ts
import 'server-only'
import { pushEndpointSchema, pushSubscriptionInput, type PushConfig, type PushSubscriptionInput } from '@/lib/dto/push'
import { getPushPublicKey } from '@/lib/server/push'
import { requireUser } from './auth'
import { db } from './db'
import { parseInput } from './errors'

/** Public: what the browser needs to subscribe, or null when Web Push is not configured. */
export const getPushConfig = (): PushConfig | null => {
  const publicKey = getPushPublicKey()
  return publicKey ? { publicKey } : null
}

/**
 * Stores the viewer's browser subscription. The endpoint is unique per browser profile, so a
 * second sign-in on the same browser re-owns the row instead of failing.
 */
export const savePushSubscription = async (input: PushSubscriptionInput): Promise<void> => {
  const viewer = await requireUser()
  const { endpoint, keys } = parseInput(pushSubscriptionInput, input)
  const data = { userId: viewer.id, p256dh: keys.p256dh, auth: keys.auth }
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, ...data },
    update: data,
  })
}

/** Removes the viewer's own subscription for `endpoint`; a missing one is fine. */
export const deletePushSubscription = async (endpoint: string): Promise<void> => {
  const viewer = await requireUser()
  const value = parseInput(pushEndpointSchema, endpoint)
  await db.pushSubscription.deleteMany({ where: { endpoint: value, userId: viewer.id } })
}
```

- [ ] **Step 5: Extend `lib/data/maintenance.ts`**

Add `import type { PushTarget } from '@/lib/server/push'` and append:

```ts
/** A user's push targets, in the shape `web-push` takes. */
export const listPushSubscriptions = async (userId: string): Promise<PushTarget[]> => {
  const rows = await db.pushSubscription.findMany({
    where: { userId },
    select: { endpoint: true, p256dh: true, auth: true },
  })
  return rows.map((row) => ({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }))
}

/** Drops a subscription the push service reported gone (404 / 410). */
export const deletePushSubscriptionByEndpoint = async (endpoint: string): Promise<void> => {
  await db.pushSubscription.deleteMany({ where: { endpoint } })
}
```

- [ ] **Step 6: Write `jobs/sendPush.ts` and register it**

```ts
import { deletePushSubscriptionByEndpoint, listPushSubscriptions } from '@/lib/data/maintenance'
import { logger } from '@/lib/server/logger'
import { PushGoneError, sendPush } from '@/lib/server/push'
import { jobs } from './definitions'

const log = logger.child({ module: 'sendPush' })

/**
 * Sends one notification to every browser subscription of a user. A subscription the push
 * service no longer knows is deleted; any other failure is rethrown after the loop so pg-boss
 * retries (a retry may reach the other subscriptions again, which is accepted).
 */
export const handleSendPush = async (payload: unknown) => {
  const { userId, title, body, url } = jobs['send-push'].schema.parse(payload)
  const targets = await listPushSubscriptions(userId)
  const results = await Promise.allSettled(
    targets.map((target) => sendPush(target, { title, body, url })),
  )
  let failure: unknown
  for (const result of results) {
    if (result.status !== 'rejected') {
      continue
    }
    if (result.reason instanceof PushGoneError) {
      await deletePushSubscriptionByEndpoint(result.reason.endpoint)
      log.info({ userId }, 'dropped an expired push subscription')
      continue
    }
    failure = result.reason
  }
  if (failure !== undefined) {
    throw failure
  }
}
```

In `worker/index.ts`: `import { handleSendPush } from '@/jobs/sendPush'` and `await register('send-push', handleSendPush)` after the `delete-object` line.

- [ ] **Step 7: Run the tests**

Run: `bun run test tests/lib/data/push.test.ts tests/jobs/sendPush.test.ts tests/jobs/definitions.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
bun run format
git add lib/data/push.ts lib/data/maintenance.ts jobs/sendPush.ts worker/index.ts tests/lib/data/push.test.ts tests/jobs/sendPush.test.ts tests/jobs/definitions.test.ts
git commit -m "feat: store push subscriptions and send Web Push from the worker

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Route Handlers, client facade and Server Actions

**Files:**
- Create: `lib/sse.ts`, `app/api/v1/events/route.ts`, `app/api/v1/notifications/route.ts`, `lib/client/notifications.ts`, `actions/notifications.ts`, `actions/push.ts`
- Create: `tests/lib/sse.test.ts`, `tests/app/api/v1/events.test.ts`, `tests/app/api/v1/notifications.test.ts`, `tests/actions/notifications.test.ts`, `tests/actions/push.test.ts`

**Interfaces:**
- Consumes: Task 4 and Task 6 DAL functions; `toErrorResponse`, `parseInput` (`lib/data/errors.ts`); `consumeRateLimit` (`lib/data/rateLimit.ts`); `getSessionUser` (`lib/data/auth.ts`).
- Produces: `formatSseEvent(data: unknown): string`, `formatSseComment(text: string): string`; `GET /api/v1/events`; `GET /api/v1/notifications?page&perPage`; `fetchNotifications(query: ListNotificationsQuery, signal?: AbortSignal): Promise<Page<Notification>>`; `markNotificationReadAction(id: number): Promise<ActionResult<Notification>>`; `markAllNotificationsReadAction(): Promise<ActionResult<number>>`; `subscribePushAction(input: PushSubscriptionInput): Promise<ActionResult<null>>`; `unsubscribePushAction(endpoint: string): Promise<ActionResult<null>>`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/sse.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatSseComment, formatSseEvent } from '@/lib/sse'

describe('sse', () => {
  it('frames a JSON data event and a comment', () => {
    expect(formatSseEvent({ type: 'unread', count: 1 })).toBe('data: {"type":"unread","count":1}\n\n')
    expect(formatSseComment('ping')).toBe(': ping\n\n')
  })
})
```

`tests/app/api/v1/events.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/v1/events/route'
import { userChannel } from '@/lib/data/channels'
import { db } from '@/lib/data/db'
import { createNotification } from '@/lib/data/notifications'
import { publish } from '@/lib/server/realtime'
import { getRedis, getRedisSubscriber } from '@/lib/server/redis'
import { createUser, resetDatabase, signInAs } from '../../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/server/push', () => ({ isPushConfigured: () => false }))

const decoder = new TextDecoder()

const open = () => {
  const controller = new AbortController()
  const request = new Request('http://localhost/api/v1/events', { signal: controller.signal })
  return { controller, response: GET(request) }
}

const readChunk = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
  const { value, done } = await reader.read()
  return done ? null : decoder.decode(value)
}

describe('GET /api/v1/events', () => {
  beforeEach(resetDatabase)
  afterAll(async () => {
    await getRedisSubscriber().quit()
    await getRedis().quit()
    await db.$disconnect()
  })

  it('rejects anonymous callers with 401 JSON', async () => {
    const response = await open().response
    expect(response.status).toBe(401)
    expect(response.headers.get('content-type')).toContain('application/json')
  })

  it('streams the unread count first, then published events, until the client disconnects', async () => {
    const user = await createUser({})
    await createNotification({ userId: user.id, type: 'comment', title: 'T', body: '', url: '/x' })
    await signInAs(user)

    const { controller, response: pending } = open()
    const response = await pending
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(response.headers.get('cache-control')).toContain('no-transform')
    const reader = response.body!.getReader()

    expect(await readChunk(reader)).toBe('data: {"type":"unread","count":1}\n\n')
    await publish(userChannel(user.id), { type: 'unread', count: 4 })
    expect(await readChunk(reader)).toBe('data: {"type":"unread","count":4}\n\n')

    controller.abort()
    expect(await readChunk(reader)).toBeNull()
  })
})
```

`tests/app/api/v1/notifications.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/v1/notifications/route'
import { db } from '@/lib/data/db'
import { createNotification } from '@/lib/data/notifications'
import { getRedis } from '@/lib/server/redis'
import { createUser, resetDatabase, signInAs } from '../../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/server/push', () => ({ isPushConfigured: () => false }))

const request = (query = '') => new Request(`http://localhost/api/v1/notifications${query}`)

describe('GET /api/v1/notifications', () => {
  beforeEach(resetDatabase)
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

  it('needs a session', async () => {
    expect((await GET(request())).status).toBe(401)
  })

  it('returns the viewer’s page and rejects a bad query with 422', async () => {
    const user = await createUser({})
    await createNotification({ userId: user.id, type: 'comment', title: 'T', body: '', url: '/x' })
    await signInAs(user)
    const response = await GET(request('?page=1&perPage=5'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ page: 1, perPage: 5, totalItems: 1 })
    expect(body.items[0]).toMatchObject({ title: 'T', readAt: null })
    expect((await GET(request('?page=0'))).status).toBe(422)
  })
})
```

`tests/actions/notifications.test.ts`:

```ts
// @vitest-environment node
import { refresh } from 'next/cache'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { markAllNotificationsReadAction, markNotificationReadAction } from '@/actions/notifications'
import { db } from '@/lib/data/db'
import { createNotification } from '@/lib/data/notifications'
import { getRedis } from '@/lib/server/redis'
import { createUser, resetDatabase, signInAs } from '../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(async () => import('../helpers/cookies'))
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/server/push', () => ({ isPushConfigured: () => false }))

describe('notification actions', () => {
  beforeEach(resetDatabase)
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

  it('marks one read and refreshes; failures come back as results', async () => {
    const user = await createUser({})
    const notification = await createNotification({ userId: user.id, type: 'comment', title: 'T', body: '', url: '/x' })
    expect(await markNotificationReadAction(notification.id)).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
    await signInAs(user)
    const result = await markNotificationReadAction(notification.id)
    expect(result.ok && result.data.readAt).toBeInstanceOf(Date)
    expect(refresh).toHaveBeenCalled()
    expect(await markNotificationReadAction(999)).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  })

  it('marks all read', async () => {
    const user = await createUser({})
    await createNotification({ userId: user.id, type: 'comment', title: 'T', body: '', url: '/x' })
    await signInAs(user)
    expect(await markAllNotificationsReadAction()).toEqual({ ok: true, data: 1 })
  })
})
```

`tests/actions/push.test.ts`:

```ts
// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscribePushAction, unsubscribePushAction } from '@/actions/push'
import { db } from '@/lib/data/db'
import { consumeRateLimit } from '@/lib/data/rateLimit'
import { getRedis } from '@/lib/server/redis'
import { createUser, resetDatabase, signInAs } from '../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(async () => import('../helpers/cookies'))
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/data/rateLimit', () => ({ consumeRateLimit: vi.fn(async () => {}) }))

const subscription = { endpoint: 'https://push.example/a', keys: { p256dh: 'p', auth: 'a' } }

describe('push actions', () => {
  beforeEach(resetDatabase)
  afterEach(() => vi.mocked(consumeRateLimit).mockClear())
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

  it('stores and removes the subscription, rate limited per user', async () => {
    expect(await subscribePushAction(subscription)).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
    const user = await createUser({})
    await signInAs(user)
    expect(await subscribePushAction(subscription)).toEqual({ ok: true, data: null })
    expect(consumeRateLimit).toHaveBeenCalledWith(`push-subscribe:user:${user.id}`, expect.anything())
    expect(await db.pushSubscription.count()).toBe(1)
    expect(await subscribePushAction({ ...subscription, endpoint: 'x' })).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(await unsubscribePushAction(subscription.endpoint)).toEqual({ ok: true, data: null })
    expect(await db.pushSubscription.count()).toBe(0)
  })
})
```

Check the exact `code` values in `types/api.ts` (`ErrorCode`) and adjust `'VALIDATION'` etc. to the real names before running.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test tests/lib/sse.test.ts tests/app/api/v1/events.test.ts tests/app/api/v1/notifications.test.ts tests/actions/notifications.test.ts tests/actions/push.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Write `lib/sse.ts`**

```ts
/** One `data:` message of a server-sent event stream (JSON, so the client parses one line). */
export const formatSseEvent = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`

/** A comment line: ignored by `EventSource`, keeps proxies from closing an idle connection. */
export const formatSseComment = (text: string) => `: ${text}\n\n`
```

- [ ] **Step 4: Write `app/api/v1/events/route.ts`**

```ts
import { toErrorResponse } from '@/lib/data/errors'
import { subscribeToNotifications } from '@/lib/data/notifications'
import type { RealtimeEvent } from '@/lib/dto/notifications'
import { formatSseComment, formatSseEvent } from '@/lib/sse'

/** Under most proxies' idle timeouts (nginx defaults to 60 s). */
const HEARTBEAT_MS = 25_000

/**
 * The viewer's realtime stream (server-sent events). The first message is the unread count, so a
 * reconnect (which `EventSource` does on its own) resyncs the badge; after that every event
 * published on the viewer's channel is forwarded. Ends when the client disconnects.
 */
export const GET = async (request: Request) => {
  const encoder = new TextEncoder()
  // Filled in once the stream starts; an event in the tiny gap before that is covered by the
  // unread count computed by the DAL after subscribing.
  let deliver: (event: RealtimeEvent) => void = () => {}
  let subscription: Awaited<ReturnType<typeof subscribeToNotifications>>
  try {
    // Signed in (401) before any stream exists; the DAL picks the channel.
    subscription = await subscribeToNotifications((event) => deliver(event))
  } catch (error) {
    return toErrorResponse(error)
  }
  const { unreadCount, unsubscribe } = subscription

  let heartbeat: ReturnType<typeof setInterval> | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // The stream is already closed; nothing to deliver to.
        }
      }
      const close = () => {
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // Already closed.
        }
      }
      deliver = (event) => send(formatSseEvent(event))
      send(formatSseEvent({ type: 'unread', count: unreadCount }))
      heartbeat = setInterval(() => send(formatSseComment('ping')), HEARTBEAT_MS)
      request.signal.addEventListener('abort', close, { once: true })
    },
    cancel() {
      clearInterval(heartbeat)
      unsubscribe()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // `no-transform` makes Next's gzip skip this response, so events are not buffered.
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
```

- [ ] **Step 5: Write `app/api/v1/notifications/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { parseInput, toErrorResponse } from '@/lib/data/errors'
import { listNotifications } from '@/lib/data/notifications'
import { listNotificationsQuery } from '@/lib/dto/notifications'

/** The bell's popover reads the latest notifications here; the page reads the DAL directly. */
export const GET = async (request: Request) => {
  try {
    const { searchParams } = new URL(request.url)
    // Decodes the query string (every value arrives as a string); the DAL validates again.
    const query = parseInput(listNotificationsQuery, Object.fromEntries(searchParams))
    return NextResponse.json(await listNotifications(query))
  } catch (error) {
    return toErrorResponse(error)
  }
}
```

- [ ] **Step 6: Write `lib/client/notifications.ts`**

```ts
import { z } from 'zod'
import type { Page } from '@/lib/dto/common'
import {
  notificationsPageSchema,
  type ListNotificationsQuery,
  type Notification,
} from '@/lib/dto/notifications'
import { env } from '@/lib/env'
import { RequestError } from './errors'

const errorMessageSchema = z.object({ message: z.string() })

/** Client facade for `GET /api/v1/notifications`; returns the same `Page<Notification>` as the DAL. */
export const fetchNotifications = async (
  query: ListNotificationsQuery,
  signal?: AbortSignal,
): Promise<Page<Notification>> => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value))
    }
  }
  const response = await fetch(`${env.apiBaseUrl}/notifications?${params}`, { signal })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const parsed = errorMessageSchema.safeParse(body)
    throw new RequestError(
      parsed.success ? parsed.data.message : `Request failed (${response.status})`,
      response.status,
    )
  }
  return notificationsPageSchema.parse(body)
}
```

- [ ] **Step 7: Write the actions**

`actions/notifications.ts`:

```ts
'use server'

import { refresh } from 'next/cache'
import { toActionFailure } from '@/lib/data/errors'
import { markAllNotificationsRead, markNotificationRead } from '@/lib/data/notifications'
import type { Notification } from '@/lib/dto/notifications'
import type { ActionResult } from '@/types/api'

export const markNotificationReadAction = async (
  id: number,
): Promise<ActionResult<Notification>> => {
  try {
    const notification = await markNotificationRead(id)
    refresh()
    return { ok: true, data: notification }
  } catch (error) {
    return toActionFailure(error)
  }
}

/** Returns how many notifications changed. */
export const markAllNotificationsReadAction = async (): Promise<ActionResult<number>> => {
  try {
    const count = await markAllNotificationsRead()
    refresh()
    return { ok: true, data: count }
  } catch (error) {
    return toActionFailure(error)
  }
}
```

`actions/push.ts`:

```ts
'use server'

import { getSessionUser } from '@/lib/data/auth'
import { toActionFailure } from '@/lib/data/errors'
import { deletePushSubscription, savePushSubscription } from '@/lib/data/push'
import { consumeRateLimit } from '@/lib/data/rateLimit'
import type { PushSubscriptionInput } from '@/lib/dto/push'
import type { ActionResult } from '@/types/api'

/** Stores the browser's push subscription; rate limited per user because it creates rows. */
export const subscribePushAction = async (
  input: PushSubscriptionInput,
): Promise<ActionResult<null>> => {
  try {
    // Signed-out callers are rejected by the DAL below; only a session has a user to count.
    const viewer = await getSessionUser()
    if (viewer) {
      await consumeRateLimit(`push-subscribe:user:${viewer.id}`, { max: 10, windowMs: 60_000 })
    }
    await savePushSubscription(input)
    return { ok: true, data: null }
  } catch (error) {
    return toActionFailure(error)
  }
}

export const unsubscribePushAction = async (endpoint: string): Promise<ActionResult<null>> => {
  try {
    await deletePushSubscription(endpoint)
    return { ok: true, data: null }
  } catch (error) {
    return toActionFailure(error)
  }
}
```

- [ ] **Step 8: Run the tests**

Run: `bun run test tests/lib/sse.test.ts tests/app/api/v1/events.test.ts tests/app/api/v1/notifications.test.ts tests/actions/notifications.test.ts tests/actions/push.test.ts`
Expected: PASS. If the events test hangs after `controller.abort()`, confirm the `abort` listener runs `controller.close()` (a closed stream resolves `read()` with `done: true`).

- [ ] **Step 9: Commit**

```bash
bun run format
git add lib/sse.ts app/api/v1/events app/api/v1/notifications lib/client/notifications.ts actions/notifications.ts actions/push.ts tests/lib/sse.test.ts tests/app/api/v1/events.test.ts tests/app/api/v1/notifications.test.ts tests/actions/notifications.test.ts tests/actions/push.test.ts
git commit -m "feat: add SSE events route, notifications endpoint and actions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `useRealtime` hook

**Files:**
- Create: `hooks/useRealtime.ts`, `tests/hooks/useRealtime.test.tsx`

**Interfaces:**
- Produces: `useRealtime(onEvent: (event: RealtimeEvent) => void): void`.

- [ ] **Step 1: Write the failing test**

`tests/hooks/useRealtime.test.tsx`:

```tsx
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRealtime } from '@/hooks/useRealtime'
import type { RealtimeEvent } from '@/lib/dto/notifications'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  closed = false
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this)
  }
  close() {
    this.closed = true
  }
  emit(data: string) {
    this.onmessage?.(new MessageEvent('message', { data }))
  }
}

const Probe = ({ onEvent }: { onEvent: (event: RealtimeEvent) => void }) => {
  useRealtime(onEvent)
  return null
}

describe('useRealtime', () => {
  beforeEach(() => {
    FakeEventSource.instances = []
    vi.stubGlobal('EventSource', FakeEventSource)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('opens one stream, hands valid events to the latest handler, and closes on unmount', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender, unmount } = render(<Probe onEvent={first} />)
    expect(FakeEventSource.instances).toHaveLength(1)
    const source = FakeEventSource.instances[0]
    expect(source.url).toBe('/api/v1/events')

    act(() => source.emit(JSON.stringify({ type: 'unread', count: 3 })))
    expect(first).toHaveBeenCalledWith({ type: 'unread', count: 3 })

    rerender(<Probe onEvent={second} />)
    expect(FakeEventSource.instances).toHaveLength(1)
    act(() => source.emit(JSON.stringify({ type: 'unread', count: 4 })))
    expect(second).toHaveBeenCalledWith({ type: 'unread', count: 4 })
    expect(first).toHaveBeenCalledTimes(1)

    act(() => source.emit('not json'))
    act(() => source.emit(JSON.stringify({ type: 'nope' })))
    expect(second).toHaveBeenCalledTimes(1)

    unmount()
    expect(source.closed).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test tests/hooks/useRealtime.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Write `hooks/useRealtime.ts`**

```ts
'use client'

import { useEffect, useEffectEvent } from 'react'
import { realtimeEventSchema, type RealtimeEvent } from '@/lib/dto/notifications'
import { env } from '@/lib/env'

/**
 * Subscribes the component to the viewer's realtime stream (`GET /api/v1/events`) for as long as
 * it is mounted. The browser's `EventSource` reconnects on its own; the server resends the unread
 * count on every connect. Only mount it for a signed-in viewer. `onEvent` may change every render:
 * the stream is opened once and always calls the latest handler.
 */
export const useRealtime = (onEvent: (event: RealtimeEvent) => void): void => {
  const handleEvent = useEffectEvent(onEvent)

  useEffect(() => {
    const source = new EventSource(`${env.apiBaseUrl}/events`)
    source.onmessage = (message: MessageEvent<string>) => {
      let data: unknown
      try {
        data = JSON.parse(message.data)
      } catch {
        return
      }
      const parsed = realtimeEventSchema.safeParse(data)
      if (parsed.success) {
        handleEvent(parsed.data)
      }
    }
    return () => source.close()
  }, [])
}
```

- [ ] **Step 4: Run the test**

Run: `bun run test tests/hooks/useRealtime.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add hooks/useRealtime.ts tests/hooks/useRealtime.test.tsx
git commit -m "feat: add useRealtime hook over EventSource

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Notification components — Item, List, MarkAllReadButton, Bell

**Files:**
- Run: `bunx shadcn@latest add popover --yes` (creates `components/SCN/popover.tsx`; keep it as generated apart from Prettier).
- Create: `components/Notifications/Item/{index.tsx,styles.module.scss}`, `components/Notifications/List/{index.tsx,styles.module.scss}`, `components/Notifications/MarkAllReadButton/index.tsx`, `components/Notifications/Bell/{index.tsx,styles.module.scss}`
- Create: `tests/components/Notifications/Item.test.tsx`, `tests/components/Notifications/Bell.test.tsx`

**Interfaces:**
- Consumes: `useRealtime` (Task 8), `fetchNotifications` (Task 7), the two notification actions (Task 7), `ROUTE_NOTIFICATIONS`, `formatDateTime` (`lib/formatDate.ts`), SCN `Button`, `Popover`.
- Produces: `NotificationItem({ notification, onOpen })`, `NotificationList({ items })`, `MarkAllReadButton({ onMarked?, size? })`, `NotificationBell({ initialUnreadCount })`.

- [ ] **Step 1: Install the popover primitive**

Run: `bunx shadcn@latest add popover --yes && bun run format`
Expected: `components/SCN/popover.tsx` exists exporting `Popover`, `PopoverTrigger`, `PopoverContent`.

- [ ] **Step 2: Write the failing tests**

`tests/components/Notifications/Item.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NotificationItem } from '@/components/Notifications/Item'
import type { Notification } from '@/lib/dto/notifications'

const notification: Notification = {
  id: 1,
  type: 'comment',
  title: 'Casey commented on "Post"',
  body: 'Nice',
  url: '/posts/u1/1',
  readAt: null,
  createdAt: new Date('2026-10-07T10:00:00.000Z'),
}

describe('NotificationItem', () => {
  it('links to the notification url and reports a click', async () => {
    const onOpen = vi.fn()
    render(<NotificationItem notification={notification} onOpen={onOpen} />)
    const link = screen.getByRole('link', { name: /Casey commented/ })
    expect(link).toHaveAttribute('href', '/posts/u1/1')
    await userEvent.click(link)
    expect(onOpen).toHaveBeenCalledWith(notification)
  })

  it('marks unread items for assistive tech', () => {
    const { rerender } = render(<NotificationItem notification={notification} onOpen={() => {}} />)
    expect(screen.getByText('Unread')).toBeInTheDocument()
    rerender(<NotificationItem notification={{ ...notification, readAt: new Date() }} onOpen={() => {}} />)
    expect(screen.queryByText('Unread')).not.toBeInTheDocument()
  })
})
```

`tests/components/Notifications/Bell.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { markAllNotificationsReadAction, markNotificationReadAction } from '@/actions/notifications'
import { NotificationBell } from '@/components/Notifications/Bell'
import { useRealtime } from '@/hooks/useRealtime'
import { fetchNotifications } from '@/lib/client/notifications'
import type { Notification, RealtimeEvent } from '@/lib/dto/notifications'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock('@/actions/notifications', () => ({
  markNotificationReadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}))
vi.mock('@/lib/client/notifications', () => ({ fetchNotifications: vi.fn() }))
vi.mock('@/hooks/useRealtime', () => ({ useRealtime: vi.fn() }))

const notification = (id: number, readAt: Date | null = null): Notification => ({
  id,
  type: 'comment',
  title: `Comment ${id}`,
  body: 'Body',
  url: `/posts/u1/${id}`,
  readAt,
  createdAt: new Date('2026-10-07T10:00:00.000Z'),
})

const page = (items: Notification[]) => ({
  items,
  page: 1,
  perPage: 10,
  totalItems: items.length,
  totalPages: 1,
})

/** The handler the bell gave to `useRealtime` on its last render. */
const emit = (event: RealtimeEvent) => {
  const calls = vi.mocked(useRealtime).mock.calls
  calls[calls.length - 1][0](event)
}

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.mocked(fetchNotifications).mockResolvedValue(page([notification(1), notification(2, new Date())]))
    vi.mocked(markNotificationReadAction).mockResolvedValue({ ok: true, data: notification(1, new Date()) })
    vi.mocked(markAllNotificationsReadAction).mockResolvedValue({ ok: true, data: 1 })
  })
  afterEach(() => vi.clearAllMocks())

  it('shows the unread count and loads the latest notifications when opened', async () => {
    render(<NotificationBell initialUnreadCount={3} />)
    const button = screen.getByRole('button', { name: 'Notifications, 3 unread' })
    expect(button).toHaveTextContent('3')
    await userEvent.click(button)
    await waitFor(() => expect(screen.getByRole('link', { name: /Comment 1/ })).toBeInTheDocument())
    expect(fetchNotifications).toHaveBeenCalledWith({ page: 1, perPage: 10 })
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/notifications')
  })

  it('hides the badge at zero', () => {
    render(<NotificationBell initialUnreadCount={0} />)
    expect(screen.getByRole('button', { name: 'Notifications' })).not.toHaveTextContent('0')
  })

  it('reacts to realtime events: unread resets the count, a notification bumps it and toasts', () => {
    render(<NotificationBell initialUnreadCount={1} />)
    emit({ type: 'unread', count: 5 })
    expect(screen.getByRole('button', { name: 'Notifications, 5 unread' })).toBeInTheDocument()
    emit({ type: 'notification', notification: notification(9) })
    expect(screen.getByRole('button', { name: 'Notifications, 6 unread' })).toBeInTheDocument()
    expect(toast).toHaveBeenCalledWith('Comment 9', expect.objectContaining({ description: 'Body' }))
  })

  it('marks an item read when opened and decrements the badge', async () => {
    render(<NotificationBell initialUnreadCount={2} />)
    await userEvent.click(screen.getByRole('button', { name: 'Notifications, 2 unread' }))
    const link = await screen.findByRole('link', { name: /Comment 1/ })
    await userEvent.click(link)
    expect(markNotificationReadAction).toHaveBeenCalledWith(1)
    expect(screen.getByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument()
  })

  it('marks everything read from the popover', async () => {
    render(<NotificationBell initialUnreadCount={2} />)
    await userEvent.click(screen.getByRole('button', { name: 'Notifications, 2 unread' }))
    await screen.findByRole('link', { name: /Comment 1/ })
    await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument())
    expect(markAllNotificationsReadAction).toHaveBeenCalled()
  })
})
```

Radix popovers in jsdom: if `PopoverContent` does not render in the test, add `vi.mock('@/components/SCN/popover', ...)` that renders `Popover` as a fragment, `PopoverTrigger` as `asChild` passthrough and `PopoverContent` as a `<div>` — but try the real primitive first (dropdown-menu tests in this repo show how Radix behaves here; check `tests/components` for a precedent).

- [ ] **Step 3: Run them to verify they fail**

Run: `bun run test tests/components/Notifications`
Expected: FAIL — modules missing.

- [ ] **Step 4: Write `components/Notifications/Item`**

`index.tsx`:

```tsx
'use client'

import clsx from 'clsx'
import Link from 'next/link'
import type { Notification } from '@/lib/dto/notifications'
import { formatDateTime } from '@/lib/formatDate'
import styles from './styles.module.scss'

export type NotificationItemProps = {
  notification: Notification
  /** Called when the viewer follows the notification (the caller marks it read). */
  onOpen: (notification: Notification) => void
}

export const NotificationItem = ({ notification, onOpen }: NotificationItemProps) => {
  const unread = notification.readAt === null
  return (
    <Link
      href={notification.url}
      className={clsx(styles.item, unread && styles.unread)}
      onClick={() => onOpen(notification)}
    >
      <span className={styles.title}>
        {notification.title}
        {unread && <span className={styles.srOnly}>Unread</span>}
      </span>
      {notification.body && <span className={styles.body}>{notification.body}</span>}
      <span className={styles.time}>{formatDateTime(notification.createdAt)}</span>
    </Link>
  )
}
```

`styles.module.scss`:

```scss
.item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
  color: var(--foreground);
  text-decoration: none;
  border-radius: var(--radius);

  &:hover {
    background: var(--accent);
  }
}

.unread {
  background: var(--muted);
}

.title {
  font-weight: 500;
  font-size: 0.875rem;
}

.body {
  color: var(--muted-foreground);
  font-size: 0.875rem;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.time {
  color: var(--muted-foreground);
  font-size: 0.75rem;
}

.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

(If the repo already has a shared `srOnly` mixin or class — `SessionList` has one — copy that exact declaration instead.)

- [ ] **Step 5: Write `components/Notifications/List` and `MarkAllReadButton`**

`List/index.tsx` — the page's list; marks an item read when followed:

```tsx
'use client'

import { markNotificationReadAction } from '@/actions/notifications'
import { NotificationItem } from '@/components/Notifications/Item'
import type { Notification } from '@/lib/dto/notifications'
import styles from './styles.module.scss'

type NotificationListProps = {
  items: Notification[]
}

export const NotificationList = ({ items }: NotificationListProps) => {
  const handleOpen = (notification: Notification) => {
    if (notification.readAt === null) {
      // The navigation is already under way; the action refreshes the router when it lands.
      void markNotificationReadAction(notification.id)
    }
  }

  return (
    <ul className={styles.list}>
      {items.map((notification) => (
        <li key={notification.id}>
          <NotificationItem notification={notification} onOpen={handleOpen} />
        </li>
      ))}
    </ul>
  )
}
```

`List/styles.module.scss`:

```scss
.list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
```

`MarkAllReadButton/index.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { markAllNotificationsReadAction } from '@/actions/notifications'
import { LoadingButton } from '@/components/LoadingButton'

type MarkAllReadButtonProps = {
  /** Runs after a successful call, so the caller can update its own state. */
  onMarked?: () => void
  size?: 'sm' | 'default'
}

export const MarkAllReadButton = ({ onMarked, size = 'default' }: MarkAllReadButtonProps) => {
  const [pending, setPending] = useState(false)

  const handleClick = async () => {
    setPending(true)
    try {
      const result = await markAllNotificationsReadAction()
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      onMarked?.()
    } finally {
      setPending(false)
    }
  }

  return (
    <LoadingButton type="button" variant="outline" size={size} loading={pending} onClick={handleClick}>
      Mark all read
    </LoadingButton>
  )
}
```

Check `components/LoadingButton`'s props (`size`, `variant`) and match them.

- [ ] **Step 6: Write `components/Notifications/Bell`**

`index.tsx`:

```tsx
'use client'

import { Bell } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import { markNotificationReadAction } from '@/actions/notifications'
import { NotificationItem } from '@/components/Notifications/Item'
import { MarkAllReadButton } from '@/components/Notifications/MarkAllReadButton'
import { Button } from '@/components/SCN/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/SCN/popover'
import { useRealtime } from '@/hooks/useRealtime'
import { fetchNotifications } from '@/lib/client/notifications'
import { ROUTE_NOTIFICATIONS } from '@/lib/constants-routes'
import type { Notification } from '@/lib/dto/notifications'
import styles from './styles.module.scss'

const PREVIEW_COUNT = 10
const BADGE_MAX = 99

type NotificationBellProps = {
  /** Rendered on the server, so the badge is right before the stream connects. */
  initialUnreadCount: number
}

export const NotificationBell = ({ initialUnreadCount }: NotificationBellProps) => {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [open, setOpen] = useState(false)
  // null until the popover was opened once.
  const [items, setItems] = useState<Notification[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useRealtime((event) => {
    if (event.type === 'unread') {
      setUnreadCount(event.count)
      return
    }
    setUnreadCount((count) => count + 1)
    setItems((current) =>
      current ? [event.notification, ...current].slice(0, PREVIEW_COUNT) : current,
    )
    toast(event.notification.title, { description: event.notification.body })
  })

  const load = async () => {
    setError(null)
    try {
      const page = await fetchNotifications({ page: 1, perPage: PREVIEW_COUNT })
      setItems(page.items)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load notifications')
    }
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      void load()
    }
  }

  const handleOpen = (notification: Notification) => {
    setOpen(false)
    if (notification.readAt !== null) {
      return
    }
    const readAt = new Date()
    setUnreadCount((count) => Math.max(0, count - 1))
    setItems((current) =>
      current?.map((item) => (item.id === notification.id ? { ...item, readAt } : item)) ?? null,
    )
    void markNotificationReadAction(notification.id)
  }

  const handleMarkedAll = () => {
    const readAt = new Date()
    setUnreadCount(0)
    setItems((current) => current?.map((item) => ({ ...item, readAt: item.readAt ?? readAt })) ?? null)
  }

  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" aria-label={label}>
          <span className={styles.trigger}>
            <Bell aria-hidden="true" />
            {unreadCount > 0 && (
              <span className={styles.badge} aria-hidden="true">
                {unreadCount > BADGE_MAX ? `${BADGE_MAX}+` : unreadCount}
              </span>
            )}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <div className={styles.panel}>
          <div className={styles.header}>
            <span className={styles.heading}>Notifications</span>
            {unreadCount > 0 && <MarkAllReadButton size="sm" onMarked={handleMarkedAll} />}
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {items && items.length === 0 && <p className={styles.empty}>You're all caught up.</p>}
          {items && items.length > 0 && (
            <ul className={styles.list}>
              {items.map((notification) => (
                <li key={notification.id}>
                  <NotificationItem notification={notification} onOpen={handleOpen} />
                </li>
              ))}
            </ul>
          )}
          <Link href={ROUTE_NOTIFICATIONS} className={styles.viewAll} onClick={() => setOpen(false)}>
            View all
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

`styles.module.scss`:

```scss
.trigger {
  position: relative;
  display: inline-flex;
}

.badge {
  position: absolute;
  top: -0.6rem;
  right: -0.7rem;
  min-width: 1.1rem;
  height: 1.1rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--primary);
  color: var(--primary-foreground);
  font-size: 0.65rem;
  font-weight: 600;
  line-height: 1.1rem;
  text-align: center;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: min(22rem, calc(100vw - 2rem));
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.heading {
  font-weight: 600;
}

.list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 24rem;
  overflow-y: auto;
}

.empty,
.error {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 0.875rem;
}

.error {
  color: var(--destructive);
}

.viewAll {
  align-self: center;
  color: var(--primary);
  font-size: 0.875rem;
  text-decoration: underline;
}
```

- [ ] **Step 7: Run the tests**

Run: `bun run test tests/components/Notifications`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
bun run format
git add components/SCN/popover.tsx components/Notifications tests/components/Notifications
git commit -m "feat: add notification bell, list and item components

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: NavBar, site layout and the `/notifications` page

**Files:**
- Modify: `components/Layout/NavBar/index.tsx`, `tests/components/Layout/NavBar.test.tsx`, `app/(site)/layout.tsx`
- Create: `app/(site)/notifications/page.tsx`, `app/(site)/notifications/view.tsx`, `app/(site)/notifications/styles.module.scss`
- Create: `tests/app/notifications.test.tsx` (only if the repo has page-level tests; check `tests/app/` — if pages are not unit-tested here, skip and rely on the manual check)

**Interfaces:**
- Consumes: `NotificationBell`, `NotificationList`, `MarkAllReadButton` (Task 9); `listNotifications`, `getUnreadNotificationCount` (Task 4); `notificationsUrlQuery`; `toScalarParams` (`lib/searchParams.ts`); `loadPage` (`lib/data/page.ts`); `useUrlState`; `Pagination`; `Empty`; `PageHeader`.
- Produces: `NavBar({ user, unreadCount })`.

- [ ] **Step 1: Update the NavBar test**

In `tests/components/Layout/NavBar.test.tsx`, add after the ThemeToggle mock:

```tsx
vi.mock('@/components/Notifications/Bell', () => ({
  NotificationBell: ({ initialUnreadCount }: { initialUnreadCount: number }) => (
    <button>Notifications {initialUnreadCount}</button>
  ),
}))
```

Change every `<NavBar user={...} />` to also pass `unreadCount={0}`, and add:

```tsx
  it('shows the bell to signed-in users only, in both menus', () => {
    const { rerender } = render(<NavBar user={user} unreadCount={2} />)
    expect(screen.getAllByRole('button', { name: 'Notifications 2', hidden: true })).toHaveLength(2)
    rerender(<NavBar user={null} unreadCount={0} />)
    expect(screen.queryAllByRole('button', { name: /Notifications/, hidden: true })).toHaveLength(0)
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test tests/components/Layout/NavBar.test.tsx`
Expected: FAIL on the new case (no bell rendered).

- [ ] **Step 3: Update `NavBar` and the layout**

In `components/Layout/NavBar/index.tsx`:
- `import { NotificationBell } from '@/components/Notifications/Bell'`
- `type NavBarProps = { user: CurrentUser | null; unreadCount: number }` and `export const NavBar = ({ user, unreadCount }: NavBarProps) => {`
- In the desktop `accountArea`, between `<ThemeToggle />` and `<AccountActions user={user} />`: `{user && <NotificationBell initialUnreadCount={unreadCount} />}`
- In `mobileAccountArea`, between `<ThemeToggle />` and the `accountArea` div: the same line.

In `app/(site)/layout.tsx`:

```tsx
import { getUnreadNotificationCount } from '@/lib/data/notifications'
// …
  const viewer = await getViewer()
  // Only a signed-in viewer has an inbox; the count seeds the bell before its stream connects.
  const unreadCount = viewer ? await getUnreadNotificationCount() : 0
  // …
      <NavBar user={viewer} unreadCount={unreadCount} />
```

- [ ] **Step 4: Write the `/notifications` page**

`app/(site)/notifications/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { ROUTE_NOTIFICATIONS } from '@/lib/constants-routes'
import { listNotifications } from '@/lib/data/notifications'
import { loadPage } from '@/lib/data/page'
import { notificationsUrlQuery } from '@/lib/dto/notifications'
import { toScalarParams } from '@/lib/searchParams'
import { NotificationsView } from './view'
import styles from './styles.module.scss'

const PER_PAGE = 20

export const metadata: Metadata = {
  title: 'Notifications',
}

const NotificationsPage = async ({ searchParams }: PageProps<'/notifications'>) => {
  // A garbled URL falls back to page 1, like the post lists.
  const query = notificationsUrlQuery.parse(toScalarParams(await searchParams))
  const notifications = await loadPage(
    () => listNotifications({ ...query, perPage: PER_PAGE }),
    ROUTE_NOTIFICATIONS,
  )

  return (
    <div className={styles.page}>
      <PageHeader title="Notifications" description="What happened to your posts." />
      <NotificationsView notifications={notifications} />
    </div>
  )
}

export default NotificationsPage
```

`app/(site)/notifications/view.tsx`:

```tsx
'use client'

import { Empty } from '@/components/Empty'
import { NotificationList } from '@/components/Notifications/List'
import { MarkAllReadButton } from '@/components/Notifications/MarkAllReadButton'
import { Pagination } from '@/components/Pagination'
import { useUrlState } from '@/hooks/useUrlState'
import type { Page } from '@/lib/dto/common'
import { notificationsUrlQuery, type Notification } from '@/lib/dto/notifications'
import styles from './styles.module.scss'

type NotificationsViewProps = {
  notifications: Page<Notification>
}

export const NotificationsView = ({ notifications }: NotificationsViewProps) => {
  const { setState, isPending } = useUrlState(notificationsUrlQuery)
  const hasUnread = notifications.items.some((item) => item.readAt === null)

  return (
    <div className={styles.view}>
      {hasUnread && (
        <div className={styles.actions}>
          {/* The action refreshes the router, so the list re-renders read. */}
          <MarkAllReadButton />
        </div>
      )}
      {notifications.items.length === 0 ? (
        <Empty title="No notifications" description="You'll hear here when someone comments on your posts." />
      ) : (
        <NotificationList items={notifications.items} />
      )}
      <Pagination
        page={notifications.page}
        totalPages={notifications.totalPages}
        onPageChange={(page) => setState({ page })}
        disabled={isPending}
      />
    </div>
  )
}
```

`app/(site)/notifications/styles.module.scss`:

```scss
.page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
  max-width: 40rem;
  margin: 0 auto;
}

.view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.actions {
  display: flex;
  justify-content: flex-end;
}
```

Check `useUrlState`'s return shape in `hooks/useUrlState.ts` (`state`, `setState`, `isPending`) and whether its schema needs every field to have a default/catch — `notificationsUrlQuery` has `page.catch(1)`, which matches `usersUrlQuery`.

- [ ] **Step 5: Run typecheck, lint and the NavBar test**

Run: `bun run typecheck && bun run lint && bun run test tests/components/Layout/NavBar.test.tsx`
Expected: all pass (`next typegen` generates `PageProps<'/notifications'>`).

- [ ] **Step 6: Commit**

```bash
bun run format
git add components/Layout/NavBar/index.tsx tests/components/Layout/NavBar.test.tsx "app/(site)/layout.tsx" "app/(site)/notifications"
git commit -m "feat: add the notifications page and the bell to the nav bar

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Web Push in the browser — `lib/push.ts`, `PushSettings`, `public/sw.js`

**Files:**
- Create: `lib/push.ts`, `tests/lib/push.test.ts`
- Create: `components/Settings/PushSettings/{index.tsx,styles.module.scss}`, `tests/components/Settings/PushSettings.test.tsx`
- Create: `public/sw.js`
- Modify: `next.config.ts` (headers for `/sw.js`), `eslint.config.mjs` (ignore `public/**`), `app/(site)/settings/page.tsx`, `app/(site)/settings/view.tsx`

**Interfaces:**
- Consumes: `getPushConfig` (Task 6), `subscribePushAction` / `unsubscribePushAction` (Task 7), `pushSubscriptionInput`, `PushConfig`.
- Produces: `urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer>`; `PushSettings({ publicKey, onSubscribe, onUnsubscribe })`; `SettingsView` gets `pushConfig: PushConfig | null`.

- [ ] **Step 1: Write the failing helper test**

`tests/lib/push.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { urlBase64ToUint8Array } from '@/lib/push'

describe('urlBase64ToUint8Array', () => {
  it('decodes URL-safe base64 without padding', () => {
    // "hello" in base64url
    expect(Array.from(urlBase64ToUint8Array('aGVsbG8'))).toEqual([104, 101, 108, 108, 111])
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255])
  })
})
```

- [ ] **Step 2: Write the failing component test**

`tests/components/Settings/PushSettings.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PushSettings } from '@/components/Settings/PushSettings'

const PUBLIC_KEY = 'BOrD_test_key'

const fakeSubscription = {
  endpoint: 'https://push.example/a',
  toJSON: () => ({ endpoint: 'https://push.example/a', keys: { p256dh: 'p', auth: 'a' } }),
  unsubscribe: vi.fn(async () => true),
}

const pushManager = {
  getSubscription: vi.fn(async (): Promise<typeof fakeSubscription | null> => null),
  subscribe: vi.fn(async () => fakeSubscription),
}

const registration = { pushManager }

const installFakes = () => {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register: vi.fn(async () => registration), ready: Promise.resolve(registration) },
  })
  vi.stubGlobal('PushManager', class {})
}

const setup = () => {
  const onSubscribe = vi.fn().mockResolvedValue({ ok: true, data: null })
  const onUnsubscribe = vi.fn().mockResolvedValue({ ok: true, data: null })
  render(<PushSettings publicKey={PUBLIC_KEY} onSubscribe={onSubscribe} onUnsubscribe={onUnsubscribe} />)
  return { onSubscribe, onUnsubscribe }
}

describe('PushSettings', () => {
  beforeEach(() => {
    installFakes()
    pushManager.getSubscription.mockResolvedValue(null)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('says so when the browser cannot do push', () => {
    vi.unstubAllGlobals()
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined })
    render(<PushSettings publicKey={PUBLIC_KEY} onSubscribe={vi.fn()} onUnsubscribe={vi.fn()} />)
    expect(screen.getByText(/not supported/i)).toBeInTheDocument()
  })

  it('registers the service worker, subscribes and stores the subscription', async () => {
    const { onSubscribe } = setup()
    const enable = await screen.findByRole('button', { name: 'Enable browser notifications' })
    await userEvent.click(enable)
    await waitFor(() =>
      expect(onSubscribe).toHaveBeenCalledWith({
        endpoint: 'https://push.example/a',
        keys: { p256dh: 'p', auth: 'a' },
      }),
    )
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js')
    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) }),
    )
    expect(await screen.findByRole('button', { name: 'Disable browser notifications' })).toBeInTheDocument()
  })

  it('shows the disable button when already subscribed and unsubscribes', async () => {
    pushManager.getSubscription.mockResolvedValue(fakeSubscription)
    const { onUnsubscribe } = setup()
    const disable = await screen.findByRole('button', { name: 'Disable browser notifications' })
    await userEvent.click(disable)
    await waitFor(() => expect(onUnsubscribe).toHaveBeenCalledWith('https://push.example/a'))
    expect(fakeSubscription.unsubscribe).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Enable browser notifications' })).toBeInTheDocument()
  })

  it('shows an action failure', async () => {
    const { onSubscribe } = setup()
    onSubscribe.mockResolvedValue({ ok: false, code: 'RATE_LIMITED', message: 'Too many attempts' })
    await userEvent.click(await screen.findByRole('button', { name: 'Enable browser notifications' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts')
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `bun run test tests/lib/push.test.ts tests/components/Settings/PushSettings.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 4: Write `lib/push.ts`**

```ts
/** Decodes a URL-safe base64 VAPID public key into the `applicationServerKey` bytes. */
export const urlBase64ToUint8Array = (base64: string): Uint8Array<ArrayBuffer> => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index)
  }
  return bytes
}
```

- [ ] **Step 5: Write `components/Settings/PushSettings`**

`index.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { LoadingButton } from '@/components/LoadingButton'
import { pushSubscriptionInput, type PushSubscriptionInput } from '@/lib/dto/push'
import { urlBase64ToUint8Array } from '@/lib/push'
import type { ActionResult } from '@/types/api'
import styles from './styles.module.scss'

const SERVICE_WORKER_URL = '/sw.js'

export type PushSettingsProps = {
  /** The VAPID public key (push is configured when the card renders). */
  publicKey: string
  /** Stores the browser's subscription (a Server Action). */
  onSubscribe: (input: PushSubscriptionInput) => Promise<ActionResult<unknown>>
  /** Forgets it (a Server Action). */
  onUnsubscribe: (endpoint: string) => Promise<ActionResult<unknown>>
}

type Support = 'checking' | 'unsupported' | 'supported'

const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window

export const PushSettings = ({ publicKey, onSubscribe, onUnsubscribe }: PushSettingsProps) => {
  const [support, setSupport] = useState<Support>('checking')
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canPush()) {
      setSupport('unsupported')
      return
    }
    let cancelled = false
    const check = async () => {
      try {
        const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL)
        const current = await registration.pushManager.getSubscription()
        if (!cancelled) {
          setSubscription(current)
          setSupport('supported')
        }
      } catch {
        if (!cancelled) {
          setSupport('unsupported')
        }
      }
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [])

  const enable = async () => {
    setError(null)
    setPending(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const next = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const input = pushSubscriptionInput.safeParse(next.toJSON())
      if (!input.success) {
        setError('This browser returned an unusable subscription.')
        return
      }
      const result = await onSubscribe(input.data)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setSubscription(next)
    } catch {
      setError('Notifications were not enabled. Check the browser permission and try again.')
    } finally {
      setPending(false)
    }
  }

  const disable = async () => {
    if (!subscription) {
      return
    }
    setError(null)
    setPending(true)
    try {
      const result = await onUnsubscribe(subscription.endpoint)
      if (!result.ok) {
        setError(result.message)
        return
      }
      await subscription.unsubscribe()
      setSubscription(null)
    } catch {
      setError('Notifications were not disabled. Try again.')
    } finally {
      setPending(false)
    }
  }

  if (support === 'checking') {
    return <p className={styles.hint}>Checking this browser…</p>
  }
  if (support === 'unsupported') {
    return <p className={styles.hint}>Browser notifications are not supported here.</p>
  }

  return (
    <div className={styles.settings}>
      <p className={styles.hint}>
        {subscription
          ? 'This browser shows a notification when someone comments on your posts, even with the tab closed.'
          : 'Get a notification from this browser when someone comments on your posts.'}
      </p>
      {subscription ? (
        <LoadingButton type="button" variant="outline" loading={pending} onClick={disable}>
          Disable browser notifications
        </LoadingButton>
      ) : (
        <LoadingButton type="button" loading={pending} onClick={enable}>
          Enable browser notifications
        </LoadingButton>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
```

`styles.module.scss`:

```scss
.settings {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
}

.hint {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 0.875rem;
}

.error {
  margin: 0;
  color: var(--destructive);
  font-size: 0.875rem;
}
```

In the test, the fake `getSubscription` resolves to a plain object; the component only uses `endpoint`, `toJSON()` and `unsubscribe()`, so type the state as `Pick<PushSubscription, 'endpoint' | 'toJSON' | 'unsubscribe'>` if the real `PushSubscription` type makes the fake fail to compile.

- [ ] **Step 6: Wire the settings page**

`app/(site)/settings/page.tsx`: import `getPushConfig` from `@/lib/data/push`, add it to the `Promise.all` (`const [user, sessions, userHasPassword, pushConfig] = await Promise.all([…, getPushConfig()])` — it is synchronous, so wrap as `Promise.resolve(getPushConfig())` or call it outside the `Promise.all`), return it, and pass `pushConfig={pushConfig}` to `SettingsView`.

`app/(site)/settings/view.tsx`: add `pushConfig: PushConfig | null` to the props (`import type { PushConfig } from '@/lib/dto/push'`), import `subscribePushAction, unsubscribePushAction` from `@/actions/push` and `PushSettings`, and render after the Sessions card:

```tsx
      {pushConfig && (
        <Card>
          <CardHeader>
            <CardTitle>Browser notifications</CardTitle>
            <CardDescription>
              Per browser. The bell in the navigation works everywhere; this adds a system
              notification when no tab is open.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PushSettings
              publicKey={pushConfig.publicKey}
              onSubscribe={subscribePushAction}
              onUnsubscribe={unsubscribePushAction}
            />
          </CardContent>
        </Card>
      )}
```

If `tests/app` or `tests/components/Settings` has a test rendering `SettingsView`, add `pushConfig={null}` there.

- [ ] **Step 7: Write `public/sw.js` and its config**

`public/sw.js`:

```js
// Web Push service worker. Registered by components/Settings/PushSettings; messages come from
// jobs/sendPush.ts with the payload { title, body, url }.

self.addEventListener('push', (event) => {
  if (!event.data) {
    return
  }
  const payload = event.data.json()
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // A focused tab already showed it through the bell.
      if (windows.some((client) => client.focused)) {
        return
      }
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        data: { url: payload.url },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = windows.find((client) => 'navigate' in client)
      if (existing) {
        await existing.focus()
        await existing.navigate(url)
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
```

`next.config.ts`: add

```ts
  headers: async () => [
    {
      // The service worker must never be served stale, or an old push handler lingers for days.
      source: '/sw.js',
      headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
    },
  ],
```

`eslint.config.mjs`: in the `globalIgnores([...])` list add `'public/**'` with the comment `// Plain browser scripts (the service worker), outside the TypeScript project.`

- [ ] **Step 8: Run the tests, lint and typecheck**

Run: `bun run test tests/lib/push.test.ts tests/components/Settings && bun run lint && bun run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
bun run format
git add lib/push.ts components/Settings/PushSettings public/sw.js next.config.ts eslint.config.mjs "app/(site)/settings" tests/lib/push.test.ts tests/components/Settings/PushSettings.test.tsx
git commit -m "feat: let users enable browser push notifications

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Docs, full verification and build

**Files:**
- Modify: `AGENTS.md`, `docs/DECISIONS.md`, `README.md`

- [ ] **Step 1: `AGENTS.md`**

Add a section **## Realtime and notifications** after **## Uploads** covering, in the file's voice:
- The contract: `lib/data/notifications.ts` + `lib/dto/notifications.ts`; `createNotification` is internal (no `requireUser()`; called by DAL functions after their own checks; document that it must never be called from a page, action or handler); the comment event in `createComment`; how to add an event type (enum value in Prisma + `notificationTypeSchema`, one `createNotification` call).
- Transport: `lib/server/realtime.ts` (`publish` never throws; `subscribe` awaits `SUBSCRIBE`), one subscriber connection per process (`getRedisSubscriber`), channel names in `lib/data/channels.ts`; `GET /api/v1/events` (headers, `unread` first, heartbeat 25 s, `no-transform`), `useRealtime` as the only client consumer; `NotificationBell`; no `remember()` for anything here.
- Web Push: VAPID trio (all or none; `bunx web-push generate-vapid-keys`), `lib/server/push.ts` is worker-only for sending, `send-push` job and `PushGoneError`, `PushSubscription` rows, `public/sw.js` focus rule and its `no-store` header, `PushSettings` on `/settings`, `getPushConfig()` as the public-key path (no `NEXT_PUBLIC_`).
- Testing notes: fakes for `web-push`, `EventSource` and `navigator.serviceWorker`; server tests quit `getRedisSubscriber()` too.

Also: add `send-push` to the **Jobs** list ("Today: …"), the new variables to **Environment & Config**, `GET /api/v1/events` and `GET /api/v1/notifications` to **Route Handlers and client facades**, `ROUTE_NOTIFICATIONS` where routes are listed, and `/notifications` and the bell to the **Project Structure** tree if routes are enumerated there.

- [ ] **Step 2: `docs/DECISIONS.md`**

Add two rows above the `Deferred` row (second column `—`):

- **Real-time:** SSE from a Route Handler + Redis pub/sub (`lib/server/realtime.ts`), one subscriber connection per process, `useRealtime` on the client. Why: Route Handlers cannot hold WebSockets (per the installed docs), every write already goes through Server Actions so server→client is enough, Redis is already there, and no new container or auth story; `no-transform` keeps Next's gzip off the stream. Centrifugo (self-hosted WS/SSE with presence and history) is the upgrade if client→server messaging is ever needed — the seam is `publish`/`subscribe` and the hook.
- **Notifications and Web Push:** `Notification` rows with flat columns and a `type` enum; `web-push` sent only by the worker (`send-push`), optional VAPID trio, `public/sw.js` skips the OS notification while a tab is focused; nothing cached (per viewer). Why: flat columns render directly and a new type needs no schema; the worker already owns retries; keys stay out of the build.

Remove the **Real-time** bullet from the `## Deferred` list.

- [ ] **Step 3: `README.md`**

Add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` to the compose/env paragraph that lists `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; add rows to the REST table:

```
| `GET`    | `/api/v1/events`              | signed in                                       | 200 `text/event-stream` of `RealtimeEvent`; first message is the unread count                              |
| `GET`    | `/api/v1/notifications`       | signed in                                       | 200 `Page<Notification>`; `page`, `perPage`                                                                |
```

and a short "Notifications" paragraph next to the uploads one (bell, `/notifications`, enabling browser notifications on `/settings`, `bunx web-push generate-vapid-keys`, Chrome treats `localhost` as a secure context so push works in `bun run dev` without HTTPS).

- [ ] **Step 4: Full verification**

Run, in order, and read every line of output:

```bash
bun run format
bun run typecheck
bun run lint
bun run format:check
bun run test
bun run build
```

Expected: all green; `bun run build` succeeds (`next.config.ts` changed). If `build` complains that `web-push` cannot be bundled, confirm `serverExternalPackages: ['web-push']` is in `next.config.ts` (Task 3).

- [ ] **Step 5: Manual check (requires Docker services, `bun run dev`, `bun run dev:worker`, VAPID keys in `.env`)**

1. Seed (`bun run db:seed`), sign in as two seeded users in two browsers. B comments on A's published post → A's bell badge increments and a toast shows without reload; open the popover → the item is there; click it → post page opens, badge decrements; `/notifications` lists it; "Mark all read" in one of A's tabs zeroes the badge in A's other tab.
2. On `/settings` as A, "Enable browser notifications" (accept the permission). Close A's tabs. B comments → an OS notification appears (worker log shows `send-push`); click it → the post opens. With an A tab focused, no OS notification shows.
3. `curl -N -H "Cookie: <A's session cookie>" http://localhost:3000/api/v1/events` prints `data: {"type":"unread",...}` at once and `: ping` lines every 25 s; without the cookie it prints a 401 JSON body.
4. Stop Redis: comments still save; the bell catches up on reload.

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md docs/DECISIONS.md README.md
git commit -m "docs: describe realtime notifications and web push

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Amendments (2026-10-08, after the security-review batch landed on this branch)

The security-review plan (`7f71dff..a9e8eb0`) changed files this plan touches. These amendments
override the task text above where they conflict; everything else stands.

1. **Task 11 Step 7 — `next.config.ts` already has `headers()`.** It now exports `SECURITY_HEADERS`
   and returns `[{ source: '/(.*)', headers: SECURITY_HEADERS }]`. Keep that export and entry, and
   **append** a second entry to the returned array:
   `{ source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] }`
   (with the comment from Step 7). Then update `tests/next.config.test.ts` — the case
   "serves the security headers on every path" must expect both entries, in that order; do not
   weaken the other cases. `poweredByHeader: false` stays.
2. **Task 7 — rate limit lives in the DAL, not the action.** The branch's convention is now that
   content-creation limits sit in the DAL function right after `requireUser()` (see
   `createComment` in `lib/data/comments.ts:91`). So: in `lib/data/push.ts` (Task 6)
   `savePushSubscription` calls
   `await consumeRateLimit(\`push-subscribe:user:${viewer.id}\`, { max: 10, windowMs: 60_000 })`
   immediately after `requireUser()` (import from `./rateLimit`), and `actions/push.ts`
   `subscribePushAction` becomes the plain `try { await savePushSubscription(input); return { ok: true, data: null } } catch { toActionFailure }`
   shape — no `getSessionUser`, no `consumeRateLimit` in the action. In `tests/actions/push.test.ts`
   drop the `@/lib/data/rateLimit` mock and the `consumeRateLimit` assertion. In
   `tests/lib/data/push.test.ts` add one case that proves the limit, written the same way
   `tests/lib/data/comments.test.ts` proves the `create-comment` limit (copy its approach:
   `vi.stubEnv('NODE_ENV', 'production')` + `vi.unstubAllEnvs()`, or its mock — whichever that
   file uses). Update the Task 7 **Interfaces** line accordingly.
3. **Task 3 — `lib/server/env.ts` gained `TRUSTED_PROXY_HOPS` and `assertAuthEnv`.** Add the VAPID
   trio after the Google pair as written; leave the new code alone. `tests/lib/server/env.test.ts`
   now also imports `assertAuthEnv`; add the VAPID case as written and the VAPID keys to `stubEnv`'s
   defaults.
4. **Task 5 — `createComment` now starts with `consumeRateLimit` (line 91).** Keep it; add the
   notification after `invalidateComments(id)` as written. `tests/lib/data/comments.test.ts` grew
   rate-limit cases; append the two new cases inside `describe('createComment')` as written.
5. **Task 4 Step 3 — `jobs/definitions.ts`:** `'send-email'` gained `deleteAfterSeconds: 3600`
   because its payload carries live links. `send-push` carries only a title, an excerpt and an app
   path, so the plan's options stand unchanged.
6. **Task 12 — `AGENTS.md`, `README.md`, `.env.example`, `docker-compose.yml` were reorganised.**
   Read their current text before editing; the plan's bullet lists say what to add, not where the
   old line numbers were. Compose now binds infrastructure ports to loopback — leave that alone.
7. **Task 1** starts from scratch: the earlier schema edit and migration folder were discarded with
   the tree; re-create them exactly as Steps 1–2 say (`bun run db:test:prepare` included).

## Self-review notes

- **Spec coverage:** data (Task 1), DTOs (Task 1), realtime (Task 2), env + push sender (Task 3), notifications DAL + comment hook (Tasks 4–5), push DAL + job (Task 6), routes/facade/actions (Task 7), hook (Task 8), bell/list (Task 9), nav/layout/page (Task 10), browser push + SW + headers (Task 11), docs (Task 12). Error-handling rules from the spec are implemented in Tasks 2 (`publish` never throws, `subscribe` propagates), 4 (404 for someone else's notification), 6 (`PushGoneError` deletes, others rethrow).
- **Type consistency:** `subscribeToNotifications` returns `{ unreadCount, unsubscribe }` (Task 4) and the route destructures exactly that (Task 7). `PushTarget` is defined in `lib/server/push.ts` (Task 3) and reused by `maintenance.ts` and `jobs/sendPush.ts` (Task 6). `NotificationItem`'s `onOpen` is used by both `List` and `Bell` (Task 9). `NavBar` takes `unreadCount` (Task 10), passed by the layout.
- **Known judgement calls left to the implementer, each flagged inline:** the `configured` flag in `lib/server/push.ts` (Task 3 Step 6), the title-length cap in `createComment` (Task 5 Step 3), Radix popover behaviour in jsdom (Task 9 Step 2), the `PushSubscription` state type (Task 11 Step 5), the exact `ErrorCode` names in action tests (Task 7 Step 1).
