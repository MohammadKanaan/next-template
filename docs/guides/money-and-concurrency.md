# Money and concurrency

A recipe, not a model: the template has no price, balance or stock column, because posts are the one
example domain. When a project adds one (an order total, a wallet, an inventory count), follow this
guide. Four pieces: how an amount is stored and sent, how to lock rows, how to write conditionally,
and when to pay for serializable isolation.

## 1. Amounts are Decimal in the database and strings everywhere else

A JS `number` cannot hold `0.10` or `19.99` exactly, and a sum of floats drifts. So:

- **Column:** `Decimal` with an explicit precision, never `Float`. Ten integer digits and two decimals
  match the DTO rule below. Keep the currency next to the amount (a three-letter code), and store the
  smallest-unit alternative (integer cents) only if you never divide or apply percentages.

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
  two-decimal **string**. Input uses `moneyInputSchema` (`lib/money.ts`:
  `z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/)`: no sign, no exponent, no thousands separator,
  at most two decimals, at most ten integer digits). Output schemas use a plain `z.string()` holding
  the amount as the DAL printed it. Never `z.number()` for money, and never `z.coerce.number()`.
- **Inside the DAL** wrap the string in `Prisma.Decimal` (`new Prisma.Decimal(input.total)`), do the
  arithmetic with its methods (`.plus`, `.minus`, `.times`), compare with `.lt` / `.gte`, and map the
  row back with `row.total.toFixed(2)`. `Prisma.Decimal` stays in `lib/data` like every Prisma
  type; the lint rule that keeps Prisma out of the other layers already covers it.
- **Display** with `formatMoney(amount, currency, locale?)` (`lib/money.ts`), which hands the string to
  `Intl.NumberFormat`, so the number never becomes a float on the way to the screen.
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
  from strings (the same rule as every raw query; see `getPostsPerDay`).
- Do the cheap checks (auth, input, exists, allowed) **before** opening the transaction, and keep the
  transaction short: no network calls, no `enqueue`, no cache writes inside it. Invalidate caches and
  queue jobs after it commits.
- Lock rows in one consistent order when a request locks more than one (sort by id), or two requests
  can deadlock each other.
- Re-check what you need on the locked row (the `deleted_at IS NULL` in `attachPostUpload`'s lock is such a
  check), because the pre-transaction read is only advisory.
- Do not read a row with several to-many relations (`postDetailSelect`: tags, attachments) through
  `tx`: Prisma loads them concurrently and an interactive transaction has one connection, which `pg`
  reports as "client.query() while already executing a query" (an error from pg@9). Return the id
  from the transaction and read the detail afterwards (`readPostDetail`).
- Postgres releases the lock at commit or rollback; there is no unlock call.

**Live examples:**

- `attachPostUpload` in `lib/data/uploads.ts` is this recipe as it stands: a tagged `$queryRaw`
  `SELECT id FROM posts WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE` inside `db.$transaction`
  serializes attaches to one post; with the lock held it counts the attached files and throws
  `ValidationError` at the cap (rolling the transaction back), then claims the pending upload. No
  attach can slip past the maximum of 10, and a post trashed meanwhile is a `NotFoundError`.
- `attachAvatar` in the same file locks the **user row** without writing `FOR UPDATE`: its first
  statement in the transaction is `tx.user.update(...)`, and an `UPDATE` takes the row lock until
  commit. Two attaches by one user run one after the other, so the later one sees (and replaces)
  the earlier avatar. Use this shortcut only when the first statement is a write you want anyway; a
  decision that must read before it writes needs the explicit `FOR UPDATE`.

## 3. Conditional write (compare and set)

When the decision depends on **one value you already read**, you do not need a lock: put that value in
the `where` of an `updateMany` and check `count`. If another request changed the row first, the
condition no longer matches, `count` is 0, and you throw `ConflictError` (409) for the caller to
reload and retry. It costs one statement, holds no lock, and cannot deadlock.

```ts
const moved = await db.post.updateMany({
  where: { id: postId, status: current.status, deletedAt: null }, // the state that was checked
  data: { status: next },
})
if (moved.count === 0) {
  throw new ConflictError('The post was changed meanwhile. Reload and try again.')
}
```

**Live examples:**

- `setPostStatus` (`lib/data/posts.ts`) checks that `current.status` may move to `next`
  (`POST_STATUS_TRANSITIONS`), then writes with the condition `status: current.status` (plus `deletedAt: null`), so two concurrent moves cannot both win; the loser gets `ConflictError`. `deletePost` and
  `restorePost` use the same idea on `deletedAt`.
- `updatePost` uses a **version column**: `Post.version` is read with the post and sent back with the
  edit, and the write is an `updateMany` whose `where` carries `id`, `version` and `deletedAt: null` and whose
  `data` increments `version`. Zero rows updated means either the post is gone (`NotFoundError`) or somebody saved
  first (`ConflictError`). Use a version column when the "checked state" is the whole row (an edit
  form, several fields), and the guarded column itself (`status`, `balance`) when it is one value.

For money the same shape works on a single-column change that a database can do atomically: either
`data: { balance: { decrement: amount } }` with `where: { id, balance: { gte: amount } }`, or the
`FOR UPDATE` recipe above when the rule needs more than one row or a read first.

Choosing between the two:

| Situation                                                     | Use                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| One row, one guarded value, a loser can simply retry          | Conditional write (`updateMany` on the checked state)              |
| A user edits a record over time (form open, then save)        | Version column + `ConflictError`                                   |
| A rule reads several rows or counts (cap, balance, stock)     | `FOR UPDATE` in a transaction                                      |
| Waiting is better than failing (a queue of identical updates) | `FOR UPDATE` (the second request waits, then sees the first's row) |

## 4. When to pick serializable isolation

The default (`READ COMMITTED`) plus the two recipes above covers nearly everything. Reach for
`db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })` when:

- the invariant spans **rows you cannot name up front**: "no two bookings overlap", "the sum of all
  allocations stays below the budget", where there is no single row to lock (a phantom read), and
- you would rather have the database prove the transaction behaves as if it ran alone than reason
  about every lock.

The price: Postgres aborts one of two conflicting transactions with a serialization failure (Prisma
error `P2034`, SQLSTATE `40001`), so the caller **must retry** the whole transaction (a small loop with
a limit of a few attempts and a short random delay) and map the final failure to `ConflictError`. The
transaction body must therefore be safe to run twice: no emails, jobs or cache invalidation inside
it. Serializable also costs throughput under contention. The template has no serializable
transaction today; if you add one, put the retry loop in a helper in `lib/data` next to `db`.

## Testing

A concurrency rule is only proven by a test that races it: start the calls together with
`Promise.allSettled` against the real test database and assert how many were fulfilled and which typed
error the others got, plus the stored value. Examples: "does not let two concurrent moves from the same
status both succeed" in `tests/lib/data/posts.test.ts` and "lets only one of two concurrent attaches of
the same upload win" and "keeps one attached avatar when two different uploads attach concurrently" in
`tests/lib/data/uploads.test.ts`. A test that calls them one after the other proves nothing about the
race.
