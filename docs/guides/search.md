# Full-text search on posts

`listPosts({ q })` searches the title and the body with Postgres full-text search. Everything else
about the list (visibility, author, status, tag, dates, the trash, paging) works as it does without
a search.

- **Schema:** `posts.search_vector` is a plain nullable `tsvector` column with a GIN index
  (`posts_search_vector_idx`), kept up to date by a trigger: `posts_search_vector_update()` sets it
  to `setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', body), 'B')`
  in a `BEFORE INSERT OR UPDATE OF title, body` trigger. The database maintains it, so no write path
  can leave it stale (`updatePost` needs no extra code, and a write that does not touch title or
  body does not recompute it). Prisma sees it as `searchVector Unsupported("tsvector")?`, never
  selects or writes it, and it is only read in raw SQL. The `english` configuration stems words
  (`running` finds `run`) and drops stop words.
- **Query syntax:** `q` goes through `websearch_to_tsquery('english', q)`: plain words are AND-ed,
  `"quoted phrase"`, `or`, and `-excluded`. It never raises a syntax error on odd input, and a query
  of stop words only (`the and of`) or punctuation only matches nothing (an empty page). `q` is
  always a bound parameter.
- **Two paths, one filter:** `resolvePostFilter(query, viewer)` (`lib/data/posts.ts`) applies the
  visibility rules once and returns a `PostFilter` (author, resolved status, trash flag, tag, date
  range). `toPrismaWhere(filter)` renders it for `findMany` / `count` (no `q`), and
  `toSqlConditions(filter)` renders the same filter as `Prisma.sql` conditions for the search query.
  A new filter is added to `PostFilter` and to both renderers; the parity test
  (`tests/lib/data/postsSearch.test.ts`) lists the same posts with and without a search that every
  fixture matches, for an anonymous visitor, the author, a stranger and an admin, and fails when
  the two disagree.
- **`searchPosts`:** one tagged `$queryRaw` returns the page of ids and the total (a `matches` CTE
  filtered by `@@` and the conditions, a `page` CTE with `ORDER BY` / `LIMIT` / `OFFSET`, and a
  left join so the total is still returned for a page past the end). Rows are parsed with Zod (the
  count is a `bigint`). The summaries are then read with `findMany({ where: { id: { in } } })` and
  `postSummarySelect` and put back in the query's order, so the result is the same `Page<PostSummary>`.
- **Order:** `sort` takes `relevance`, `newest` and `oldest`. Left out, it is `relevance` while `q`
  is set and `newest` otherwise (`resolvePostsSort`); `relevance` without a search means `newest`.
  Relevance is `ts_rank` (a title match outweighs a body match), ties broken by newest. In the URL
  contract `sort` is `''` for "the default", so `?q=cats` ranks by relevance and `?sort=newest`
  overrides it; the sort select offers "Most relevant" only while a search is applied.
- **Caching:** a search is never cached (free text is unbounded), as before.
- **Escaping:** `lib/data/escapeLike.ts` stays, for `listUsers` (`contains` with `ILIKE`); post
  search does not use `LIKE`.
- **Migrations:** the column, the trigger function, the trigger and the index are hand-written SQL
  in `prisma/migrations/*_add_post_search_vector` and `*_post_search_vector_trigger`. The first
  version was a `GENERATED ALWAYS AS ... STORED` column, but Prisma cannot model a generated column
  and every later `prisma migrate dev` proposed `ALTER COLUMN "search_vector" DROP DEFAULT`, which
  Postgres rejects. A plain column plus a trigger matches the schema exactly (Prisma ignores
  triggers and functions), so `prisma migrate diff --from-config-datasource --to-schema
prisma/schema.prisma --script` prints an empty migration. Changing the weights or the text search
  configuration means a new migration that replaces the function and backfills with
  `UPDATE posts SET title = title`.
- **Limits:** the search is an unauthenticated read like the list, bounded by `q` <= 100
  characters and `MAX_PAGE`. A rate limit on it and non-English configurations are not done.
