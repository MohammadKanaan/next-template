# Uploads

Files go straight from the browser to S3-compatible storage; the app only issues tickets and
records the result. Two purposes use the same machinery: `avatar` (the user's photo) and
`attachment` (files on a post).

- `lib/server/storage.ts`: presigned **POST** (a presigned PUT cannot cap size) with
  `content-length-range` and `Content-Type` conditions, `headObject`, `deleteObject`,
  `publicUrl(key)`.
- The `Upload` table (`key` unique, `userId`, `purpose` `avatar` | `attachment`, `contentType`,
  `size`, `status` `pending` | `attached`, `name` (attachments only, `VARCHAR(255)`), `postId`
  (attachments only, `onDelete: SetNull`, indexed)) tracks every object.
- **Rules per purpose:** `UPLOAD_RULES` in `lib/dto/uploads.ts` is the one table:
  `{ contentTypes, maxSize, maxPending, ticketSeconds }` (plus the two messages shown for a bad type
  or size). Avatar: PNG, JPEG, WebP, 2 MB, 3 pending. Attachment: PNG, JPEG, WebP, GIF, PDF, CSV (no
  SVG or HTML: the bucket is public), 10 MB, 5 pending. `createUploadInput { purpose, contentType,
size, name? }` is refined against the rule of its `purpose` (an attachment needs a `name`, trimmed
  and at most 255 characters); the DAL reads limits from the same table, and `AvatarUploader` and
  `PostAttachments` take `accept` and the size from it. `POST_ATTACHMENTS_MAX` is 10.
- `lib/data/uploads.ts`: `createUpload(input)` (signed in → input valid → key
  `<purpose>s/<userId>/<uuid>` → `pending` row → ticket; reclaim and the pending cap work per
  purpose) and `attachAvatar` (signed in → exists → owner, i.e. 401/404/403 → `headObject`
  re-checks size and type against the rule, deleting an object that broke the rules (the row stays
  `pending` for the cleanup, because the ticket may still be valid) → mark `attached`, set
  `user.image`, delete the previous avatar's row and queue a delayed `delete-object` for its object (see Orphans) →
  `invalidateTags(userTag)`).
- **Attachments:** `attachPostUpload(postId, uploadId)` is signed in (401) → input valid (422) → the
  post exists and is live (404) → `postPolicy.update`, author or admin (403) (all through
  `requirePostChange(viewer, id, 'update')`, so a trashed post is 404) → the upload exists (404),
  is of purpose `attachment`, and is the viewer's own (403) → still pending (422) → `headObject`
  re-check (422) → in a transaction that locks the post row (`FOR UPDATE`): fewer than 10 attached
  (422), then claim the pending row (`attached` + `postId`). `detachPostUpload(postId, uploadId)`
  has the same first steps, then the attachment must belong to that post (404), whoever uploaded
  it; the row is deleted and a delayed `delete-object` queued like a replaced avatar. Both
  `invalidateTags(postTag(id))` and neither bumps `Post.version`. `PostDetail.attachments`
  (`attachmentSchema`: `id`, `name`, `url`, `contentType`, `size`, `createdAt`, oldest first) comes
  from `postDetailSelect` and is cached with the post under `postTag`; anyone who can see the post
  can read the list.
- Orphans: the hourly `cleanup` job deletes `pending` uploads, of every purpose, older than 24 hours
  with their objects, looping through batches (at most 20 per run). Tickets last
  `UPLOAD_TICKET_SECONDS` (300, `lib/dto/uploads.ts`, per purpose in the rule). An object is only
  deleted after its ticket plus `UPLOAD_OBJECT_GRACE_SECONDS` (600, same file) have passed, because
  S3 checks expiry when the upload starts and an object re-uploaded to a key with no row would be
  invisible to every cleanup: the `delete-object` jobs for replaced avatars, removed attachments and
  deleted accounts are queued with `startAfter` (`objectDeleteDelaySeconds(purpose)`), and
  `createUpload` reclaims (object, then row) only pending uploads older than that same cut-off. Rows
  past the ticket but inside the grace period are neither counted nor touched. When the user holds
  `maxPending` live tickets of a purpose it throws `RateLimitedError`. `createUploadAction` is rate
  limited per user too (30 a minute, so a batch of files fits), so pending rows stay bounded. Because
  those `delete-object` jobs are delayed by the ticket lifetime plus grace, a replaced avatar, a
  removed attachment, and the files of a deleted account, stay readable at their public URL for
  about 15 minutes.
- **Posts that go away:** `purgeDeletedPosts` (`lib/data/maintenance.ts`) works in batches inside a
  transaction that locks the batch's posts: it re-checks they are still past the cut-off (a restore
  that raced with it wins), queues a `delete-object` job (no delay: the tickets are long dead) for
  every attachment key, deletes the upload rows, then the posts. A job that cannot be queued rolls the
  batch back and fails the run, so nothing is deleted without its objects being queued. Deleting an
  account queues the keys of the user's own uploads and of files others (an admin) attached to their
  posts, and removes the latter rows (the posts cascade, `SetNull` would leave them behind).
- Client: `lib/client/uploads.ts` (`uploadFile`) is the one facade that talks to a non-app URL.
  `AvatarUploader` on `/settings` runs ticket action → `uploadFile` → attach action.
  `components/Form/FileUploader` is the reusable picker: multiple files, `accept` and `maxSize` from
  props, files sent one after the other, per-file state (waiting, uploading, uploaded, or an inline
  error), no progress bar (`fetch` has no upload progress). `components/Posts/Attachments` (client)
  uses it on the post edit page for ticket action → `uploadFile` → `attachPostUploadAction`, lists the
  current files with a Remove button (`detachPostUploadAction`) and reloads the page with
  `router.refresh()`; attachments change at once and do not wait for "Save changes".
  `components/Posts/AttachmentList` (server) lists them as links on the detail page.
- Avatars render through `UserAvatar` (shadcn `Avatar`) with a plain `<img>`, so no `next/image`
  `remotePatterns` are needed.
- **Public bucket:** both prefixes, `avatars/` and `attachments/`, are publicly readable (the
  compose `minio-init` sets it); on real S3 give both prefixes the same bucket policy. A file is
  reachable by anyone with its URL (the key holds a random UUID), even when its post is a draft, so
  attachments are not for private documents. A private variant would serve through short-lived
  signed GET URLs from the DAL instead of `publicUrl`.
