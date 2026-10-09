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
  any URL parses (`postsUrlQuery` in `lib/dto/posts.ts` is the one contract, shared with the
  page's `searchParams`, which the page reduces with `toScalarParams` from `lib/searchParams.ts`:
  a repeated param reads as its last value on server and client alike). `setState(patch)` is one
  navigation per patch; each patch builds on the last query requested (not the
  committed URL), so two patches issued before the first lands both survive. Keys that are empty
  or equal to the default leave the URL, unknown params stay. Scalars only. On a page that
  reads nothing on the server the component using it must sit inside `<Suspense>` (see **React
  Components**). A filter change resets `page` in the same patch.
- Only write a hook for independent logic or logic shared across components (e.g. `useScrollLock`). Never extract a hook for logic that is married to one component and gains
  nothing from the abstraction.
