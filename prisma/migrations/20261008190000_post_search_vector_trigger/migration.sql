-- The generated `search_vector` column made Prisma propose `ALTER COLUMN ... DROP DEFAULT` (which
-- Postgres rejects for a generated column) on every `migrate dev`. A plain nullable column kept
-- up to date by a trigger matches `Unsupported("tsvector")?` exactly, and the database still
-- maintains it, so no write path can forget it. Prisma ignores triggers and functions.
DROP INDEX "posts_search_vector_idx";
ALTER TABLE "posts" DROP COLUMN "search_vector";
ALTER TABLE "posts" ADD COLUMN "search_vector" tsvector;

CREATE FUNCTION posts_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."search_vector" :=
    setweight(to_tsvector('english', coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."body", '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_search_vector_trigger
  BEFORE INSERT OR UPDATE OF "title", "body" ON "posts"
  FOR EACH ROW EXECUTE FUNCTION posts_search_vector_update();

-- Backfill the rows that exist (the trigger fires on this update too).
UPDATE "posts" SET "title" = "title";

-- CreateIndex
CREATE INDEX "posts_search_vector_idx" ON "posts" USING GIN ("search_vector");
