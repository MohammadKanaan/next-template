# Posts: the example resource

Posts exist to show every layer once (`prisma/schema.prisma` → `lib/dto/posts.ts` →
`lib/data/posts.ts` → `actions/posts.ts` and `app/api/v1/posts` → the pages). Replace them with
your first real resource by following the same shape; "Adding a resource" in the README is the
checklist.

- **Schema:** `Post { id, title, body, published, userId, createdAt, updatedAt }`, cascading from
  the user. `published` is a boolean: a post is a draft or it is published, nothing in between.
- **Visibility:** only published posts are public. A draft is visible to its author and to admins;
  for anyone else `getPost` throws `NotFoundError`, the same answer as a missing post. `listPosts`
  shows published posts only, except to an author listing their own posts (`authorId` equals their
  id) and to admins, who see drafts too and may narrow with `published` (anyone else's `published`
  is ignored). The rules are `postPolicy` in `lib/data/policies/posts.ts` (`view`, `update`,
  `delete`), pure functions of `(viewer, record)` tested per viewer.
- **Order of checks:** reads answer 404 for a post the viewer may not see; writes follow signed in
  (401) → input valid (422) → exists (404) → allowed (403), so a stranger who tries to change a
  draft gets 403. `getPost` and the write functions take the raw route param; a malformed id is
  simply not found.
- **Caching:** `getPost` caches the viewer-independent detail (`post:<id>`, tags `POSTS_TAG` and
  `postTag(id)`) and computes `permissions` after the cache read, per viewer. `listPosts` caches
  only the published-only list without a search or an author (`['posts:list', page, perPage, sort]`
  under `POSTS_TAG`); a search term or an author id is unbounded or viewer dependent and reads the
  database. Every write invalidates `POSTS_TAG` (and `postTag(id)` for an existing post) right
  after it succeeds. A profile edit invalidates `POSTS_TAG` too, because lists embed the author.
- **Search:** `q` is a case-insensitive `contains` on the title, with `%` and `_` escaped
  (`escapeLike`), so a search is text, never a pattern. Full-text search, tags, comments, soft
  delete and optimistic locking were part of an earlier, heavier version of this example; the git
  history (`docs/DECISIONS.md`, "Removed") has them if a project needs one.
- **Rate limit:** `createPost` consumes `create-post:user:<id>` (20 per minute) right after
  `requireUser()`, so the Server Action and the REST handler share the limit.
- **DTOs:** `createPostInput` (`published` defaults to `false`), `updatePostInput` (every field
  optional, at least one defined), `listPostsQuery` (`page`, `perPage`, `authorId`, `q`, `sort`,
  `published`), `postsUrlQuery` (the tolerant URL twin, every field `.catch()`es), `PostSummary`
  (excerpt, for lists) and `PostDetail` (full body, timestamps, `permissions`).
- **UI:** `/posts` (public list; the page renders the cards, `view.tsx` owns search, sort and
  pagination through `useUrlState`), `/posts/mine` (the author's own list with drafts, a table),
  `/posts/new` and `/posts/[id]/edit` (`PostForm`: title, body and a Published checkbox through
  RHF's `Controller`; the edit view sends only the changed fields), `/posts/[id]` (a Server
  Component; `DeletePostButton` is the one client leaf). `PostsFilters` and `PostStatusBadge` are
  the shared pieces, shown in `/ui-kit`.
- Tests that create posts and expect them to be public set `published: true` explicitly, since the
  default is a draft.
