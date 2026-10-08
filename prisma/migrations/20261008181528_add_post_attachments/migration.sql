-- AlterEnum
ALTER TYPE "UploadPurpose" ADD VALUE 'attachment';

-- AlterTable
ALTER TABLE "uploads" ADD COLUMN     "name" VARCHAR(255),
ADD COLUMN     "post_id" INTEGER;

-- CreateIndex
CREATE INDEX "uploads_post_id_idx" ON "uploads"("post_id");

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
