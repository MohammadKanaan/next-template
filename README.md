# Next Template

A small Next.js 16 baseline to start a real app from: App Router, a server-only data layer on Prisma
and PostgreSQL, Better Auth with its admin plugin, Server Actions for writes, a REST API over the
same functions, Zod DTOs shared with the forms, and shadcn/ui.

Everything in it is either infrastructure you keep (auth, accounts, admin, cache, rate limits, jobs,
email, logging) or one example resource, posts, which shows every layer once and is meant to be
replaced by your first real resource.

## Quick start

```bash
cp .env.example .env              # then set BETTER_AUTH_SECRET: openssl rand -base64 32
cp .env.test.example .env.test
docker compose up -d              # PostgreSQL 18 and Redis 7
bun install                       # also generates the Prisma client
bun run db:deploy                 # apply migrations
bun run db:seed                   # 3 users, 12 posts
bun run dev                       # http://localhost:3000
bun run dev:worker                # second terminal: emails and cleanup
```

Log in as `leanne@example.com` or `admin@example.com`; the password is `password123` for both.
`/signup` creates an account.

The worker is a second process and not optional in practice: without it, no verification or reset
email is sent. With no `RESEND_API_KEY` it logs each email to the terminal instead of sending it, so
the verification and reset links are right there.

## Requirements

PostgreSQL and Redis. Redis 7 is a hard floor, because the rate limiter uses `PEXPIRE ... NX`. If you
run the services yourself, create the `next_template_dev` and `next_template_test` databases and
point `REDIS_URL` at your instance in both `.env` and `.env.test`. More in the setup guide below.

## Where to look next

- [`AGENTS.md`](AGENTS.md) has the conventions and rules. The code and its comments are the
  documentation; prose exists only for what they cannot carry.
- [`docs/guides/getting-started.md`](docs/guides/getting-started.md): the stack, full setup, Docker,
  every script, testing, the rename checklist and removing the posts example.
- [`docs/guides/uploads.md`](docs/guides/uploads.md): creating the R2 bucket for profile photos.
- [`docs/DECISIONS.md`](docs/DECISIONS.md): what was chosen and why, and what was removed.
- [`docs/recipes/`](docs/recipes/): concurrency and the other patterns the template leaves out.
