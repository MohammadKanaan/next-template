# One image for the web process, the worker and the migrations: the same files and node_modules
# run `bun run start`, `bun run worker` and `bun run db:deploy` (compose picks the command).
#
# bun is only the package manager and script runner; the scripts themselves run on Node, so the
# image carries both. Keep the bun version in step with `packageManager` in package.json.
# `output: 'standalone'` is deliberately not used: the worker runs the TypeScript source through
# `tsx`, so it needs the source tree and the full node_modules anyway.

ARG NODE_VERSION=24
ARG BUN_VERSION=1.3.10

FROM oven/bun:${BUN_VERSION} AS bun

FROM node:${NODE_VERSION}-slim AS base
# Prisma's schema engine (used by `prisma migrate deploy`) needs OpenSSL, which the slim image lacks.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# Dependencies. `postinstall` runs `prisma generate`, so the schema and config must be present
# before `bun install`; the generated client lands in /app/generated.
FROM base AS deps
COPY package.json bun.lock ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN bun install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/generated ./generated
COPY . .
# NEXT_PUBLIC_* values are inlined into the client bundle at build time. Everything else is read at
# runtime, so the build needs no database, Redis or storage.
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
  NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN bun run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
CMD ["bun", "run", "start"]
