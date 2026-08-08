-- CreateTable
CREATE TABLE "Backup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL DEFAULT 'auto',
    "label" TEXT NOT NULL DEFAULT '',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL,

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Backup_createdAt_idx" ON "Backup"("createdAt");
