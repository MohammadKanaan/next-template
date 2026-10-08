-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "deleted_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "posts_user_id_deleted_at_idx" ON "posts"("user_id", "deleted_at");
