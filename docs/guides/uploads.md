# Uploads (Cloudflare R2)

Files go straight from the browser to the bucket; the app only issues tickets and records the result.
The one implemented purpose is the profile photo on `/settings` (`avatar`). Storage is Cloudflare R2
through its S3 API, so the client is `@aws-sdk/client-s3`; nothing here is R2-specific except the
endpoint and the absence of presigned POST.

## Flow

1. **Ticket** (`createUpload(input)` in `lib/data/uploads.ts`): signed in → `createUploadInput` valid
   for its purpose (type and exact size against `UPLOAD_RULES`) → storage configured (otherwise a
   `ValidationError`, "Uploads are not available") → expired pending uploads of that purpose are
   reclaimed → at most `maxPending` live tickets per user (`RateLimitedError`) → a `pending` row with
   the key `avatars/<userId>/<uuid>` → a **presigned PUT** from `createUploadTicket`
   (`lib/server/storage.ts`). `createUploadAction` also rate-limits tickets per user (30 a minute).
2. **Upload** (`uploadFile(ticket, file)` in `lib/client/uploads.ts`): the browser `PUT`s the file to
   the ticket's URL with the ticket's headers. It is the one client-side fetch to a non-app URL;
   bytes never pass through the app.
3. **Attach** (`attachAvatar(uploadId)`): signed in → id valid → the row exists and is of the purpose
   (404) → it is the viewer's own (403; not even an admin may use someone else's upload) → still
   `pending` → `headObject` re-checks size and type against the rule (an object that broke them is
   deleted at once; the row stays pending for the cleanup) → in one transaction: `user.image =
publicUrl(key)`, the row becomes `attached` (an `updateMany` on `status: 'pending'`, so a
   concurrent attach of the same upload matches nothing and rolls back), the previous attached rows
   are deleted → the user's cache tag is invalidated → each replaced object is queued for deletion.
   `attachAvatarAction` calls `refresh()` so the layout shows the new image.
4. **Delete later, not now.** Storage checks a presigned URL's expiry when the request starts, so a
   slow upload begun just before expiry can land after it. An object is therefore never deleted before
   its ticket lifetime plus `UPLOAD_OBJECT_GRACE_SECONDS` (300 s + 600 s): the replaced avatar goes
   through a delayed `delete-object` job, and deleting an account queues one per key of the user in
   Better Auth's `beforeDelete` hook (`lib/data/auth.ts`), delayed by `MAX_OBJECT_DELETE_DELAY_SECONDS`
   (the rows cascade with the user, the objects would not).
5. **Orphans.** The hourly `cleanup` job calls `deleteStalePendingUploads` (`lib/data/maintenance.ts`):
   `pending` rows older than a day, oldest first, in batches of 100 (at most 20 batches a run), object
   first so a storage failure leaves the row for the next run. `createUpload` reclaims the viewer's
   own expired tickets sooner, when they ask for a new one.

## Why a presigned PUT, and what it enforces

R2 has no presigned POST, whose policy could cap a size _range_. The PUT's signature covers the
`Content-Type` and the exact `Content-Length` instead (`signableHeaders`, `SignedHeaders =
content-length;content-type;host` in the URL), so a file of another type or size is refused by R2
with a 403. The browser sets `Content-Length` from the body itself; the ticket's `headers` carry the
content type and are sent as they are. The DTO already checked both against the rule when the ticket
was issued, and `attach` checks the stored object a third time with `headObject`.

## Rules and limits

`UPLOAD_RULES` in `lib/dto/uploads.ts` is the one definition of what each purpose accepts: the DTO
refines against it, the DAL reads `maxSize`, `maxPending` and `ticketSeconds` from it, and
`AvatarUploader` takes `accept` and the size hint from it. Avatars: PNG, JPEG or WebP, 2 MB, three
live tickets per user, 300 s tickets. **No SVG or HTML, ever:** the bucket serves files from a
public origin, and those execute in the browser.

Adding a purpose: a value in `uploadPurposeSchema`, a row in `UPLOAD_RULES`, a value in the Prisma
`UploadPurpose` enum (migration), an `attachXxx` DAL function modelled on `attachAvatar` (and the
record it links to), its action, and a wrapper component around `components/Form/FileUploader`.

## Configuration

The five `R2_*` variables are **optional as a group** (`lib/server/env.ts` refuses a partial set).
Without them `isStorageConfigured()` is false, the DAL refuses tickets, `/settings` hides the profile
photo card (`canUpload()`), and the template runs without an R2 account. With them:

| Variable               | Value                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `R2_ACCOUNT_ID`        | Your Cloudflare account id; the S3 endpoint is `https://<account>.r2.cloudflarestorage.com`.        |
| `R2_ACCESS_KEY_ID`     | From an R2 API token with **Object Read & Write** on the bucket (R2 → Manage R2 API Tokens).        |
| `R2_SECRET_ACCESS_KEY` | Its secret.                                                                                         |
| `R2_BUCKET`            | The bucket name.                                                                                    |
| `R2_PUBLIC_URL`        | The bucket's public origin, no path: its `https://pub-….r2.dev` subdomain or a custom domain on it. |

Setting up the bucket in the Cloudflare dashboard:

1. **Create the bucket.** Location hint as you like; `region` in the client is `auto`.
2. **Public access.** Settings → Public access: enable the `r2.dev` subdomain (fine for a template;
   rate limited and not for production traffic) or connect a custom domain (recommended in production:
   Cloudflare's cache and WAF sit in front). Either origin is `R2_PUBLIC_URL`. This makes **every
   object in the bucket** readable by URL, drafts included: private documents need short-lived signed
   GET URLs from the DAL instead of `publicUrl`, and a separate bucket.
3. **CORS.** Settings → CORS policy. The browser's presigned PUT is a cross-origin request with a
   `Content-Type` header, so it preflights; allow your app origins:
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "https://your-app.example"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["Content-Type", "Content-Length"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   Reads through `R2_PUBLIC_URL` are plain `<img>` loads and need no CORS.
4. **API token.** Manage R2 API Tokens → Create: Object Read & Write, scoped to this bucket. The
   token's Access Key ID and Secret Access Key are the two credential variables.

The client uses path-style URLs (`forcePathStyle: true`): tickets look like
`https://<account>.r2.cloudflarestorage.com/<bucket>/avatars/<userId>/<uuid>?X-Amz-…`, so one host
covers CORS and any CSP `connect-src`, and a bucket name with dots still gets a valid certificate.

Compose passes the five variables from `.env` to `web` and `worker` (empty by default). Tests mock
`@/lib/server/storage` and never need an account; `tests/lib/server/storage.test.ts` checks the
signature against a stubbed environment.

## Pieces

- `lib/server/storage.ts`: lazy `S3Client` on `globalThis`, `isStorageConfigured`,
  `createUploadTicket`, `headObject` (null for 404), `deleteObject` (a missing key is success),
  `publicUrl`.
- `lib/dto/uploads.ts`: rules, `createUploadInput`, `uploadTicketSchema`, `uploadIdSchema`, the delay
  constants.
- `lib/data/uploads.ts`: `canUpload`, `createUpload`, `attachAvatar`.
- `actions/uploads.ts`: `createUploadAction`, `attachAvatarAction`.
- `lib/client/uploads.ts`: `uploadFile`; `lib/client/errors.ts`: `RequestError`.
- `components/Form/FileUploader` (reusable picker: `accept`, `maxSize`, per-file state, files sent
  one after the other; `fetch` has no upload progress) and `components/Settings/AvatarUploader`
  (asks for the ticket, uploads, attaches, reports). Avatars render through a plain `<img>`, so
  `next/image` remote patterns are not needed.
- `jobs/deleteObject.ts`, `deleteStalePendingUploads` in `lib/data/maintenance.ts`, the
  `beforeDelete` hook in `lib/data/auth.ts`.
- Tests under the mirrored paths; `tests/lib/data/uploads.test.ts` covers the order of checks, the
  pending cap, reclaiming, the concurrent attach and the delayed deletes.
