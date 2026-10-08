# Posts: workflow, visibility, comments, tags

The posts example carries the domain patterns an app needs (all in `lib/data/posts.ts` and
`lib/data/comments.ts`, shapes in `lib/dto/posts.ts` and `lib/dto/comments.ts`).

- **Schema:** `Post.status` (`draft` | `published` | `archived`, default `draft`) and
  `publishedAt`; `Comment` (cascades from post and user); `Tag` (`name` unique, stored lowercased)
  and the explicit join table `PostTag` (composite id, cascades). The migration backfills posts
  that existed before the workflow to `published`.
- **Visibility:** only `published` posts are public. A draft or archived post is visible to its
  author and to admins; for anyone else `getPost` throws `NotFoundError`, the same answer as a
  missing post. `getPost` caches the viewer-independent part (`getPostBase`, private to
  `lib/data/posts.ts`, so nothing outside it can read a draft) and applies `canViewPost` and
  `permissions` after the cache read; `listComments` goes through `getPost` for the same reason,
  and `canViewPost` is exported only as a pure predicate for `createComment`'s database read. Reads
  of an invisible post answer 404, but writes follow exists (404) → allowed (403), so a stranger who
  tries to change or delete a draft gets 403. `listPosts` shows `published` only,
  except to an author listing their own posts (`authorId` equals their id), who sees every status
  unless they pass `status`. An admin is not special on a general list: it is `published` only too,
  but an admin may pass `status` (and so may the author); anyone else's `status` other than
  `published` is ignored. A result the viewer's identity changed skips `remember()`.
  `/posts/mine` (`ROUTE_POSTS_MINE`, private) is the author's own list with the filters (including
  the status select) and `PostStatusActions` per row.
- **Multi-filter lists:** `listPostsQuery` takes `authorId`, `q`, `sort`, `status`, `tag` and
  `from` / `to` (UTC `YYYY-MM-DD`, both days inclusive, on `createdAt`); `buildPostWhere` in the DAL
  composes them. `postsUrlQuery` is the tolerant URL twin (every field `.catch()`es to `''` / its
  default; `toListPostsParams` turns `''` into `undefined`) shared by the SSR pages and
  `useUrlState`. `components/Posts/Filters` is one component: tag select (from `listTags`), date
  inputs, sort, "Clear filters", and a status select only on the page that passes `status`. Any
  filter change resets `page` to 1 in the same patch.
- **Status workflow:** `POST_STATUS_TRANSITIONS` in `lib/dto/posts.ts` is the one definition (draft
  → published; published → archived | draft; archived → published). `setPostStatus` enforces it
  (signed in → exists → author or admin → transition allowed, else `ValidationError` on `status`),
  stamps `publishedAt` on the first publication, and writes conditionally on the checked status so
  concurrent moves cannot both win. The UI (`components/Posts/StatusActions`) only offers the moves
  the map allows. `createPost` always creates a draft.
- **Transaction:** `createPost` / `updatePost` write the post and its tags in one `db.$transaction`
  (`replacePostTags`: upsert tag rows in sorted order, drop the links no longer wanted). On update,
  omitting `tags` leaves them alone and `[]` clears them. Tag names are normalized by
  `tagNameSchema` (trimmed, lowercased, at most 30 characters; at most 5 per post, de-duplicated).
- **Comments** (the nested resource): `listComments(postId)` (oldest first, capped, cached per post,
  `permissions.delete` added per viewer; it applies the same visibility rule as the post),
  `createComment` (signed in; the post must be visible and published, read from the database, not
  the cache), `deleteComment` (the comment's author, the post's author or an admin).
- **Invalidation:** `commentCount` and `tags` are embedded in cached lists and details, so every
  comment write invalidates `POSTS_TAG`, `postTag(id)` and `commentsTag(id)`, and every tag or status
  change invalidates `POSTS_TAG` and `postTag(id)`. Cached comments carry `POSTS_TAG` too, because
  commenters' names are embedded (a profile edit drops them). `listTags()` (tags of published posts
  with counts) is cached under `POSTS_TAG`.
- **UI:** the detail page stays a Server Component (status badge, `PostTags`, an async
  `CommentThread` in its own `<Suspense>`); the status buttons, `CommentForm` and
  `DeleteCommentButton` are the client leaves. `components/Form/TagsInput` is the reusable chips
  control (owns `label` / `error` like `Form/Input`); `PostForm` uses it through RHF's `Controller`.
- Tests that create posts and expect them to be public set `status: 'published'` explicitly, since
  the default is `draft`.

- **Policies:** the record-level rules are in `lib/data/policies/posts.ts` (`postPolicy`: `view`,
  `update`, `delete`, `changeStatus`, `comment`; `commentPolicy`: `delete`), pure functions of
  `(viewer, record)` tested per viewer. `requirePostChange(viewer, id, action)` picks the rule for the
  write (`update`, `delete` or `changeStatus`) and `authorize()`s it after the exists check, so the
  order stays 401 → 422 → 404 → 403. `permissions` on `PostDetail` and `Comment` come from
  `permissionsFor(policy, ['update', 'delete', 'restore'], viewer, record)`. The record carries
  `deletedAt`, so every rule but `restore` is false for a trashed post.
- **Soft delete (trash):** `Post.deletedAt` (indexed with `userId`). `deletePost` only sets it (conditional
  on `deletedAt: null`); `restorePost` clears it (conditional on `deletedAt != null`) and returns the
  `PostDetail`. A trashed post is invisible to every public read: `listPosts`, `listTags`, the stats
  (`getSiteStats`, `getMyStats`, `getPostsPerDay`), `listComments` and `createComment` all skip it.
  `getPost` answers not found for it unless `postPolicy.restore` allows the viewer (the author and
  admins), who get `permissions` of `{ update: false, delete: false, restore: true }`. Every other
  write on a trashed post (update, status change, delete) answers 404, and `restorePost` on a live
  post answers 404 too; a stranger on a trashed post gets 403 (exists, then allowed). The trash list is
  `listPosts({ trash: true })`: honoured only on the viewer's own list (`authorId` equals their id) or
  for an admin, ignored otherwise (like `status`), never cached, and with no status filter unless one is
  passed. `trash` is a real boolean or the strings `true` / `false` (never `z.coerce.boolean()`, which
  reads `'false'` as true). Comments are kept with a trashed post and listed again after a restore.
  `purgeDeletedPosts({ olderThanDays: 30, batch: 20 })` in `lib/data/maintenance.ts`, run by the hourly
  `cleanup` job, deletes what has been in the trash longer than that (comments and tag links cascade).
  UI: the Trash checkbox in `PostsFilters` (only where `status` is passed, so `/posts/mine`),
  `RestorePostButton` on trashed rows and on the detail page, "Move to trash" on `DeletePostButton`.
  REST `DELETE /posts/{id}` still answers 204 (it moves the post to the trash).
