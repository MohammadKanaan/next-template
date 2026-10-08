# Audit log

Who changed what and when, for admins. One table (`audit_logs`), one internal writer, one admin-only
reader, one page.

- **Schema:** `AuditLog { id, actorId?, action, entityType, entityId, metadata?, createdAt }`.
  `actorId` references `users` with `onDelete: SetNull`, so an entry outlives its actor (the page shows
  "Deleted user"); because it does not cascade, `audit_logs` is in `resetDatabase()`'s TRUNCATE list.
  `entityId` is text so one column holds post ids, comment ids and user ids. Indexes: on the entity
  (`entityType`, `entityId`), on `createdAt` and on `actorId` (the foreign key and the actor filter).
- **DTOs** (`lib/dto/audit.ts`): `auditActionSchema` is the closed list of actions: `post.create`,
  `post.update`, `post.status`, `post.delete` (trash), `post.restore`, `comment.delete`, `user.role`.
  The column is a plain string; the schema is the source of truth, and `recordAudit` rejects anything
  outside it. The entity type is the part of the action before the dot (`auditEntityTypeOf`), so the two
  cannot disagree. `listAuditQuery` (page, `entityType?`, `actorId?`) is the DAL contract and
  `auditUrlQuery` its tolerant URL twin (`''` is no filter).
- **Writing: `recordAudit(entry)`** (`lib/data/audit.ts`) is internal, like `createNotification`: no
  `requireUser()`, the caller passes `actorId`. It is called from inside the DAL write paths, after the
  write succeeded and the caches were invalidated: `createPost`, `updatePost`, `setPostStatus`,
  `deletePost`, `restorePost`, `deleteComment` and `setUserRole`. Never call it from a page, action or
  Route Handler. A failure (including an invalid entry) is logged with the action only and swallowed:
  the change is already saved and must not report as failed. It is not part of the write's
  transaction, so a crash between the two can lose an entry; making it atomic means passing the
  transaction client through.
- **What goes in `metadata`:** ids, changed field names and state names only (`auditMetadataSchema`:
  strings, numbers, booleans and string lists, nothing nested). `post.update`: `{ fields, version }`
  (the keys the edit carried, plus `tags` when tags were sent, and the new version);
  `post.status`: `{ from, to }`; `comment.delete`: `{ postId, authorId }`; `user.role`:
  `{ from, to }`; create, delete and restore carry none. Never a title, a body, a comment or an email:
  the log outlives the records it describes. Attaching and detaching files is not recorded.
- **Reading: `listAuditLog(query)`** is admin only (`requireAdmin()`, 401/403), newest first, paginated,
  filtered by entity type and actor, and never cached.
- **UI:** `/admin/audit` (`ROUTE_ADMIN_AUDIT`, private by default, linked from `/admin`):
  `page.tsx` reads `searchParams` with `auditUrlQuery` through `loadPage` (a non-admin gets the
  not-found page), `view.tsx` renders the table, the entity-type select and `Pagination` through
  `useUrlState`. A filter change resets `page`.
- **Adding an action:** one value in `auditActionSchema`, a label in `ACTION_LABELS`
  (`app/(site)/admin/audit/view.tsx`, typed so a missing label fails to compile), and one
  `recordAudit` call after the write in its DAL function; a new entity type also goes in
  `auditEntityTypeSchema`.
