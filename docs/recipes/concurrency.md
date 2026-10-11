# Concurrency: money, row locks, conditional writes, optimistic locking

Four pieces: how an amount is stored and sent, how to lock rows, how to write conditionally (including
a version column for forms), and when to pay for serializable isolation. None of it exists in the
template today; the posts example does a plain `update` and a delete is a delete.

## 1. Amounts are `Decimal` in the database and strings everywhere else

A JS `number` cannot hold `0.10` or `19.99` exactly, and a sum of floats drifts. So:

- **Column:** `Decimal` with an explicit precision, never `Float`. Keep the currency next to the
  amount (a three-letter code).

  ```prisma
  model Order {
    id        Int      @id @default(autoincrement())
    userId    String   @map("user_id")
    total     Decimal  @db.Decimal(12, 2)
    currency  String   @default("USD") @db.VarChar(3)
    createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
    user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@index([userId])
    @@map("orders")
  }
  ```

- **Across every boundary** (DTOs, Server Actions, Route Handlers, JSON, the client) an amount is a
  two-decimal **string**. Input schema: `z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/)` (no sign,
  no exponent, no thousands separator, at most two decimals, ten integer digits). Output schemas use
  a plain `z.string()` holding the amount as the DAL printed it. Never `z.number()` for money, and
  never `z.coerce.number()`.
- **Inside the DAL** wrap the string in `Prisma.Decimal` (`new Prisma.Decimal(input.total)`), do the
  arithmetic with its methods (`.plus`, `.minus`, `.times`), compare with `.lt` / `.gte`, and map the
  row back with `row.total.toFixed(2)`. `Prisma.Decimal` stays in `lib/data` like every Prisma type;
  the lint rule that keeps Prisma out of the other layers already covers it.
- **Display** by handing the string to `Intl.NumberFormat` (`format(Number(amount))` is acceptable
  for display only, since the value is never written back), or format the string by hand.
- **Never** `parseFloat`, `Number(...)`, `+amount` or `toFixed` on a JS number for a stored amount.
  Round only in the DAL, on a `Decimal`, with a rounding mode you chose
  (`toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)`).

## 2. Lock the row, then check, then write (`FOR UPDATE`)

Use it when a decision reads a value and a write depends on it, and a concurrent request could change
the value in between: "debit only if the balance covers it", "attach only if there is room", "reserve a
unit of stock". Without the lock two requests both read the old value and both succeed.

Shape: one interactive `db.$transaction`, the row locked with a tagged `$queryRaw` (Prisma has no
`FOR UPDATE`), the row parsed with Zod, the rule checked on the locked data, and **the refusal thrown
inside the transaction**, so it rolls back and releases the lock.

```ts
const lockedBalance = z.array(z.object({ balance: z.string() })) // numeric comes back as text

export const debitWallet = async (walletId: number, amount: string): Promise<WalletDetail> => {
  const viewer = await requireUser()
  const { id, amount: debit } = parseInput(debitWalletInput, { id: walletId, amount })
  await requireWalletChange(viewer, id) // exists (404) → allowed (403), before the lock
  const row = await db.$transaction(async (tx) => {
    const rows = lockedBalance.parse(
      await tx.$queryRaw`SELECT balance::text AS balance FROM wallets WHERE id = ${id} FOR UPDATE`,
    )
    if (rows.length === 0) {
      throw new NotFoundError('Wallet not found') // deleted since the check
    }
    const balance = new Prisma.Decimal(rows[0].balance)
    if (balance.lt(debit)) {
      throw new ValidationError({ amount: ['Insufficient balance'] }) // rolls back, lock released
    }
    return tx.wallet.update({
      where: { id },
      data: { balance: balance.minus(debit) },
      select: walletDetailSelect,
    })
  })
  await invalidateTags(walletTag(id)) // after the commit, never inside it
  return toWalletDetail(row)
}
```

Rules that keep it correct:

- Tagged template only, so every value is a bound parameter. Never `$queryRawUnsafe`, never SQL built
  from strings.
- Do the cheap checks (auth, input, exists, allowed) **before** opening the transaction, and keep the
  transaction short: no network calls, no email, no cache writes inside it. Invalidate caches and
  queue jobs after it commits.
- Lock rows in one consistent order when a request locks more than one (sort by id), or two requests
  can deadlock each other.
- Re-check what you need on the locked row, because the pre-transaction read is only advisory.
- Do not read a row with several to-many relations through `tx`: Prisma loads them concurrently and
  an interactive transaction has one connection, which `pg` reports as "client.query() while already
  executing a query". Return the id from the transaction and read the detail afterwards.
- A shortcut when the first statement is a write you want anyway: an `UPDATE` takes the row lock
  until commit, so `tx.user.update(...)` as the first statement serializes the rest of the
  transaction per user without an explicit `FOR UPDATE`. A decision that must read before it writes
  still needs the explicit lock.
- Postgres releases the lock at commit or rollback; there is no unlock call.

## 3. Conditional write (compare and set)

When the decision depends on **one value you already read**, you do not need a lock: put that value in
the `where` of an `updateMany` and check `count`. If another request changed the row first, the
condition no longer matches, `count` is 0, and you throw a conflict for the caller to reload and
retry. It costs one statement, holds no lock, and cannot deadlock.

```ts
const moved = await db.post.updateMany({
  where: { id: postId, status: current.status }, // the state that was checked
  data: { status: next },
})
if (moved.count === 0) {
  throw new ConflictError('The post was changed meanwhile. Reload and try again.')
}
```

The template has no `ConflictError`; add it to `lib/data/errors.ts` as a `DataError` with code
`CONFLICT`, map it to **409** in `STATUS_BY_CODE`, and add `'CONFLICT'` to `ErrorCode` in
`types/api.ts`. `toActionFailure`, `toErrorResponse` and `applyActionErrors` need nothing else.

### Optimistic locking with a version column

Use a version column when the "checked state" is the whole row: a user opens an edit form, types for a
while, and saves. Two editors of one record would otherwise silently overwrite each other.

- Schema: `version Int @default(1)` on the model.
- The detail DTO carries `version`; the update input requires it (`z.number().int().positive()`),
  so a REST `PATCH` without it answers 422.
- The write is `updateMany({ where: { id, version }, data: { ...fields, version: { increment: 1 } } })`.
  Zero rows updated means either the record is gone (check with a `findFirst`, then
  `NotFoundError`) or somebody saved first (`ConflictError`). Prisma skips `@updatedAt` for an empty
  `data`, so set `updatedAt: new Date()` yourself when every field may be omitted.
- Decide what the version guards. The old implementation bumped it for title, body and tags edits
  only; a status move, a trash or a restore was a different kind of change with its own conditional
  write (section 3), so an open edit form did not conflict with a publish.
- The form keeps the version it loaded as a non-rendered value and sends it back; the view shows a
  `CONFLICT` failure as the form-level alert with a **Reload** button (`router.refresh()`), and the
  form follows the refreshed record through RHF's `values`.

Choosing between the approaches:

| Situation                                                     | Use                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| One row, one guarded value, a loser can simply retry          | Conditional write (`updateMany` on the checked state)              |
| A user edits a record over time (form open, then save)        | Version column + `ConflictError`                                   |
| A rule reads several rows or counts (cap, balance, stock)     | `FOR UPDATE` in a transaction                                      |
| Waiting is better than failing (a queue of identical updates) | `FOR UPDATE` (the second request waits, then sees the first's row) |

For money the same shape works on a single-column change that a database can do atomically: either
`data: { balance: { decrement: amount } }` with `where: { id, balance: { gte: amount } }`, or the
`FOR UPDATE` recipe above when the rule needs more than one row or a read first.

## 4. When to pick serializable isolation

The default (`READ COMMITTED`) plus the recipes above covers nearly everything. Reach for
`db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })` when:

- the invariant spans **rows you cannot name up front**: "no two bookings overlap", "the sum of all
  allocations stays below the budget", where there is no single row to lock (a phantom read), and
- you would rather have the database prove the transaction behaves as if it ran alone than reason
  about every lock.

The price: Postgres aborts one of two conflicting transactions with a serialization failure (Prisma
error `P2034`, SQLSTATE `40001`), so the caller **must retry** the whole transaction (a small loop with
a limit of a few attempts and a short random delay) and map the final failure to `ConflictError`. The
transaction body must therefore be safe to run twice: no emails, jobs or cache invalidation inside
it. Serializable also costs throughput under contention. Put the retry loop in a helper in
`lib/data` next to `db`.

## Testing

A concurrency rule is only proven by a test that races it: start the calls together with
`Promise.allSettled` against the real test database and assert how many were fulfilled and which typed
error the others got, plus the stored value. A test that calls them one after the other proves nothing
about the race.

## From the history (`7bd01c5`)

- `lib/money.ts` and `tests/lib/money.test.ts`: `moneyInputSchema`, `formatMoney`.
- `lib/data/posts.ts`: `updatePost` (version column), `setPostStatus` (conditional write),
  `requirePostChange`; `tests/lib/data/posts.test.ts` has the `Promise.allSettled` races.
- `lib/data/uploads.ts`: `attachPostUpload` (`FOR UPDATE` with a cap), `attachAvatar` (lock by `UPDATE`).
- `components/Posts/Form` and `app/(site)/posts/[userId]/[id]/edit/view.tsx`: the version in the
  form and the Reload button.
