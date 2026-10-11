# Recipes

How to add a capability **this template does not implement** in a way that fits its architecture
(DAL owns auth and validation, DTOs in `lib/dto`, typed errors, Redis cache, Server Actions and Route
Handlers over the same functions). A recipe is not documentation of code in this repo: nothing it
names exists here unless the text says so. The guides in `docs/guides/` describe what is implemented;
if a recipe and a guide disagree, the guide is right about the code and the recipe about the pattern.

Every pattern below was built and tested in this template once, then removed in the 2026-10-09
simplification (`docs/DECISIONS.md`, "Removed"). The last commit that holds all of it is `7bd01c5`
(branch `feat/take-home-patterns`): `git show 7bd01c5:<path>` prints a file, `git checkout 7bd01c5 --
<path>` restores it. Each recipe ends with the paths worth pulling.

| Recipe                                       | Add it when                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [`concurrency.md`](concurrency.md)           | Two requests can change one record: edits, balances, stock, status moves.                                                                  |
| [`removed-patterns.md`](removed-patterns.md) | Notifications, realtime, push, audit log, soft delete, full-text search, nested resources, cursor pagination, React Email, client facades. |
