# File uploads to S3-compatible storage

Files go straight from the browser to the bucket; the app only issues tickets and records the
result. The template has no storage client, no `Upload` table and no `S3_*` variables; this is how to
add them in the shape that worked.

## Shape

1. **Ticket.** The DAL (`createUpload(input)`) checks signed in → input valid → whatever the file is
   for exists and the viewer may change it (404 / 403, so no ticket is issued for a file that could
   not be attached), generates a key `<purpose>s/<userId>/<uuid>`, inserts a `pending` row, and
   returns a **presigned POST** (`@aws-sdk/s3-presigned-post`, `createPresignedPost`) with the
   conditions `['content-length-range', 0, maxSize]` and `['eq', '$Content-Type', contentType]`.
   A presigned PUT cannot cap the size; POST can. Tickets live 300 s.
2. **Upload.** The browser sends the file to the ticket's URL with the fields it carries, through a
   small facade (`uploadFile(ticket, file)`); it is the one client-side fetch to a non-app URL. File
   bytes never pass through the app.
3. **Attach.** The DAL (`attachAvatar(uploadId)`, `attachXUpload(...)`) checks signed in → the row
   exists, is the viewer's own and still `pending` → **`headObject` re-checks size and content type
   against the rule** (the policy is the first defence, this the second; an object that broke the
   rules is deleted, the row stays `pending` for the cleanup) → marks the row `attached` and links
   it (`user.image = publicUrl(key)`, or `postId`) → invalidates the cache of what it changed.
4. **Replace or remove.** The previous object is deleted **later**, not now: queue a delayed
   `delete-object` job (`docs/guides/jobs.md`) with `startAfter: ticketSeconds + grace`, because S3
   checks a presigned POST's expiry when the request starts, so a slow upload begun just before
   expiry can land after it, and an object re-uploaded to a key with no row would be invisible to
   every cleanup. 300 s ticket + 600 s grace meant a replaced file stayed readable for about 15 min.
5. **Orphans.** An hourly job deletes `pending` rows older than a day with their objects, in batches.
   Deleting an account queues `delete-object` for every key of the user first (the rows cascade,
   the objects would not).

## Schema

```prisma
enum UploadPurpose {
  avatar
  attachment
}

enum UploadStatus {
  pending
  attached
}

model Upload {
  id          String        @id @default(uuid())
  key         String        @unique
  userId      String        @map("user_id")
  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  purpose     UploadPurpose
  contentType String        @map("content_type")
  size        Int
  /// The original file name, shown to people, never used as a key (attachments only).
  name        String?       @db.VarChar(255)
  /// What the attachment belongs to, once attached; `SetNull` so the row survives for the purge.
  postId      Int?          @map("post_id")
  post        Post?         @relation(fields: [postId], references: [id], onDelete: SetNull)
  status      UploadStatus  @default(pending)
  createdAt   DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([userId, purpose, status])
  @@index([postId])
  @@index([status, createdAt])
  @@map("uploads")
}
```

## One rules table per purpose

Put the limits in `lib/dto/uploads.ts` so the DTO refines against them, the DAL reads them, and the
picker component takes `accept` and `maxSize` from them:

```ts
export const UPLOAD_RULES: Record<UploadPurpose, UploadRule> = {
  avatar: {
    contentTypes: ['image/png', 'image/jpeg', 'image/webp'],
    maxSize: 2 * 1024 * 1024,
    maxPending: 3, // live tickets one user may hold; more is RateLimitedError
    ticketSeconds: 300,
    typeError: 'Use a PNG, JPEG, or WebP image',
    sizeError: 'The image must be 2 MB or smaller',
  },
  attachment: {
    contentTypes: [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'application/pdf',
      'text/csv',
    ],
    maxSize: 10 * 1024 * 1024,
    maxPending: 5,
    ticketSeconds: 300,
    typeError: 'Use a PNG, JPEG, WebP or GIF image, a PDF, or a CSV file',
    sizeError: 'The file must be 10 MB or smaller',
  },
}
```

No SVG or HTML on a public bucket: they execute in the browser from your origin's neighbour. Cap the
number of attachments per record (the old limit was 10) with a `FOR UPDATE` on the parent row
(`concurrency.md`, section 2), and rate limit the ticket action per user (30 a minute fits a batch).

## Configuration

`lib/server/storage.ts` builds one lazy `S3Client` from `serverEnv()`:

| Variable                                   | Purpose                                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `S3_ENDPOINT`                              | Where the server talks to storage (`http://localhost:9000` for MinIO, `http://minio:9000` in compose).            |
| `S3_PUBLIC_ENDPOINT`                       | Optional: the endpoint as the browser reaches it, for the presigned POST, when `S3_ENDPOINT` is an internal host. |
| `S3_REGION`                                | `us-east-1` for MinIO.                                                                                            |
| `S3_BUCKET`                                | The bucket.                                                                                                       |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Credentials.                                                                                                      |
| `S3_PUBLIC_URL`                            | Base of public object URLs (`publicUrl(key)`), e.g. `http://localhost:9000/<bucket>`.                             |

Use `forcePathStyle: true` for MinIO. On real S3 add a bucket CORS rule that allows `POST` from your
origin (`AllowedMethods: ["POST"]`, `AllowedOrigins: [your origin]`, `AllowedHeaders: ["*"]`); MinIO
allows all origins by default. Make the prefixes you serve publicly readable
(`mc anonymous set download local/<bucket>/avatars`), and remember that means anyone with a URL can
read the file, draft or not: private documents need short-lived signed GET URLs from the DAL instead
of `publicUrl`. Tests mock `@/lib/server/storage` and never need MinIO.

Compose services for development:

```yaml
minio:
  image: cgr.dev/chainguard/minio:latest # upstream minio/minio is no longer published
  command: server /data --console-address ':9001'
  environment: { MINIO_ROOT_USER: minioadmin, MINIO_ROOT_PASSWORD: minioadmin }
  ports: ['127.0.0.1:9000:9000', '127.0.0.1:9001:9001']
  volumes: ['minio-data:/data']
minio-init:
  image: cgr.dev/chainguard/minio-client:latest
  depends_on: [minio]
  entrypoint: ['/bin/sh', '-c']
  command:
    - >
      until mc alias set local http://minio:9000 minioadmin minioadmin; do sleep 1; done &&
      mc mb --ignore-existing local/next-template &&
      mc anonymous set download local/next-template/avatars
  restart: 'no'
```

## UI

A reusable picker (`components/Form/FileUploader`: multiple files, `accept` and `maxSize` from props,
files sent one after the other, per-file state, no progress bar since `fetch` has no upload progress)
and thin wrappers per purpose (`AvatarUploader` on the settings page; an attachments card on an edit
page that keeps its own list from what the actions return, so it does not refresh the form beside
it). Avatars render through a plain `<img>`, so `next/image` remote patterns are not needed.

## From the history (`7bd01c5`)

- `lib/server/storage.ts`, `lib/data/uploads.ts`, `lib/dto/uploads.ts`, `actions/uploads.ts`,
  `lib/client/uploads.ts`, `docs/guides/uploads.md`.
- `components/Form/FileUploader`, `components/Settings/AvatarUploader`, `components/Posts/Attachments`,
  `components/Posts/AttachmentList`.
- `jobs/deleteObject.ts`, `jobs/cleanup.ts`, `deleteStalePendingUploads` in `lib/data/maintenance.ts`,
  the `beforeDelete` hook in `lib/data/auth.ts`.
- Tests: `tests/lib/data/uploads.test.ts`, `tests/lib/data/postAttachments.test.ts`,
  `tests/lib/server/storage.test.ts`, `tests/components/Form/FileUploader.test.tsx`.
