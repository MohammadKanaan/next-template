# Hooks

- Located in `hooks/`. Named `useXxx` and exported as named `const` arrow functions.
- Return objects with state and callbacks.
- **No `useMemo` / `useCallback` / `React.memo`.** The React Compiler memoizes components and
  hooks at build time (and in Vitest, through `vitest.config.mts`), so derived values and
  callbacks are plain `const`s. Two rules keep that safe:
  - **Never rely on memoization for correctness.** Code must behave the same if a value is
    recreated on every render. When an effect needs the latest props or state without re-running,
    read them through `useEffectEvent` (`NavBar`'s resize handler) instead of listing a callback
    as a dependency.
  - **A file that uses React Hook Form opts out with `'use no memo'`** below `'use client'`.
    `register()` must run on every render (a reset clears the field registry and the next render
    refills it); compiled, the call is cached and the form stops following resets and new
    `values`. ESLint fails the file if the directive is missing.
- **URL state:** `useUrlState(schema, { history })` (`hooks/useUrlState.ts`) keeps list filters in
  the query string. The schema is a Zod object whose fields all have `.default()` / `.catch()`, so
  any URL parses (`postsUrlQuery` in `lib/dto/posts.ts` is the one contract, shared with the SSR
  page's `searchParams`, which the page reduces with `toScalarParams` from `lib/searchParams.ts`:
  a repeated param reads as its last value on server and client alike). `setState(patch)` is one
  navigation per patch; each patch builds on the last query requested (not the
  committed URL), so two patches issued before the first lands both survive. Keys that are empty
  or equal to the default leave the URL, unknown params stay. Scalars only. On a page that
  reads nothing on the server the component using it must sit inside `<Suspense>` (see **React
  Components**). A filter change resets `page` in the same patch.
- **Browser storage:** `useLocalStorage(key, schema)` / `useSessionStorage(key, schema)` return
  `{ value, setValue, removeValue }`. They sit on `useSyncExternalStore` with a `null` server
  snapshot, so `value` is `null` on the server and on the first client render (no hydration
  mismatch) and also when nothing valid is stored (missing, malformed JSON, or failing the Zod
  schema). Pass a module-level schema. Quota and private-mode errors are swallowed by
  `lib/browserStorage.ts`; tabs stay in sync through the `storage` event. Do not render
  storage-dependent UI as if the value were already known on the first render. No page uses them yet;
  they are ready for per-browser state such as a dismissed banner or a saved filter.
- **Infinite lists:** `useInfiniteList(fetchPage, { initial })` (`hooks/useInfiniteList.ts`) grows a
  list one `CursorPage` at a time and returns `{ items, loadMore, hasMore, isLoading, error, reset }`.
  `initial` is the page the server rendered (read once). `fetchPage(cursor, signal)` is a client
  facade (`fetchNotifications`, `fetchComments`) and must pass the `signal` on. One request is in
  flight at a time (a second `loadMore` does nothing), a failure keeps the items and sets `error`
  (the next `loadMore` retries), and unmount or `reset` aborts the request and drops its result.
  `components/InfiniteSentinel` calls `loadMore` when it scrolls into view (disable it while
  loading and after an error); the "Load more" button stays as the fallback, and is the only
  trigger for comments. Content the server already rendered can stay server-rendered as `children`
  of the client list (`components/Comments/List`, which starts the hook with no items). A list that
  keeps its own copy must update it itself after a write (the router refresh only reaches
  server-rendered props): `/notifications` overlays "mark all read", the comment list drops a
  deleted comment.
- Only write a hook for independent logic or logic shared across components (e.g. `useScrollLock`). Never extract a hook for logic that is married to one component and gains
  nothing from the abstraction.
