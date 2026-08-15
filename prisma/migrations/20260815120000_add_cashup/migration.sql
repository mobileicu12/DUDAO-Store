-- CreateTable
CREATE TABLE "CashUp" (
    "id" TEXT NOT NULL,
    "businessDay" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "who" TEXT NOT NULL DEFAULT '',
    "float" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expectedCash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "countedCash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "variance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "byMethod" JSONB NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CashUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashUp_businessDay_idx" ON "CashUp"("businessDay");

-- CreateIndex
CREATE INDEX "CashUp_createdAt_idx" ON "CashUp"("createdAt");
