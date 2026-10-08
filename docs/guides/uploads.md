# Uploads

Files go straight from the browser to S3-compatible storage; the app only issues tickets and
records the result.

- `lib/server/storage.ts`: presigned **POST** (a presigned PUT cannot cap size) with
  `content-length-range` and `Content-Type` conditions, `headObject`, `deleteObject`,
  `publicUrl(key)`.
- The `Upload` table (`key` unique, `userId`, `purpose`, `contentType`, `size`, `status`
  `pending` | `attached`) tracks every object.
- `lib/data/uploads.ts`: `createAvatarUpload` (signed in → key `avatars/<userId>/<uuid>` → `pending`
  row → ticket) and `attachAvatar` (signed in → exists → owner, i.e. 401/404/403 → `headObject`
  re-checks size and type, deleting an object that broke the rules (the row stays `pending` for the
  cleanup, because the ticket may still be valid) → mark `attached`, set
  `user.image`, delete the previous avatar's row and queue a delayed `delete-object` for its object (see Orphans) →
  `invalidateTags(userTag)`).
- Orphans: the hourly `cleanup` job deletes `pending` uploads older than 24 hours with their
  objects, looping through batches (at most 20 per run). Tickets last `AVATAR_UPLOAD_TICKET_SECONDS`
  (300, `lib/dto/uploads.ts`). An object is only deleted after its ticket plus
  `UPLOAD_OBJECT_GRACE_SECONDS` (600, same file) have passed, because S3 checks expiry when the
  upload starts and an object re-uploaded to a key with no row would be invisible to every cleanup:
  the `delete-object` jobs for replaced avatars and deleted accounts are queued with `startAfter`,
  and `createAvatarUpload` reclaims (object, then row) only pending uploads older than that same
  cut-off. Rows past the ticket but inside the grace period are neither counted nor touched. When the
  user holds `MAX_PENDING_AVATAR_UPLOADS` (3) live tickets it throws `RateLimitedError`. `createAvatarUploadAction`
  is rate limited per user too, so pending rows stay bounded. Because those `delete-object` jobs are
  delayed by the ticket lifetime plus grace, a replaced avatar, and the avatars of a deleted
  account, stay readable at their public URL for about 15 minutes.
- Client: `lib/client/uploads.ts` (`uploadFile`) is the one facade that talks to a non-app URL.
  `AvatarUploader` on `/settings` runs ticket action → `uploadFile` → attach action.
- Avatars render through `UserAvatar` (shadcn `Avatar`) with a plain `<img>`, so no `next/image`
  `remotePatterns` are needed.
