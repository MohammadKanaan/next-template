# Next Template

A Next.js 16 starting point: a server-only data layer on Prisma and PostgreSQL, Better Auth with
its admin plugin, Server Actions and a REST API over the same functions, Zod DTOs shared with the
forms, and shadcn/ui. Everything is infrastructure you keep (auth, accounts, admin, cache, rate
limits, jobs, email, logging) except posts, an example resource to replace with your own.

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

Log in as `leanne@example.com` or `admin@example.com` with `password123`, or sign up at `/signup`.
Without the worker no email is sent; without `RESEND_API_KEY` it prints each email, links included,
to its terminal.

## Docs

- [`AGENTS.md`](AGENTS.md): conventions and rules. The code and its comments are the rest.
- [`docs/guides/getting-started.md`](docs/guides/getting-started.md): services, optional features,
  renaming, removing the posts example, Docker, tests.
- [`docs/guides/uploads.md`](docs/guides/uploads.md): the R2 bucket for profile photos.
- [`docs/DECISIONS.md`](docs/DECISIONS.md): what was chosen and why.
- [`docs/recipes/concurrency.md`](docs/recipes/concurrency.md): money, locking and conflicts, which
  the template leaves out.
