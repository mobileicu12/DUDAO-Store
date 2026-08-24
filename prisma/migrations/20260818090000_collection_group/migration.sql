-- AlterTable
ALTER TABLE "Collection" ADD COLUMN "group" TEXT NOT NULL DEFAULT '';

-- Index for grouping the list
CREATE INDEX "Collection_group_idx" ON "Collection"("group");
