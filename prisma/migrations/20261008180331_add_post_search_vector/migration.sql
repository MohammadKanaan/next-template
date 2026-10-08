-- Full-text search: a stored column maintained by the database from title (weight A) and body
-- (weight B), so no write path can forget to refresh it. Prisma models it as `Unsupported` and
-- never writes it.
ALTER TABLE "posts" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("body", '')), 'B')
  ) STORED;

-- CreateIndex
CREATE INDEX "posts_search_vector_idx" ON "posts" USING GIN ("search_vector");
