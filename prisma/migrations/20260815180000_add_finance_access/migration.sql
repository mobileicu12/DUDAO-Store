-- CreateTable
CREATE TABLE "FinanceAccess" (
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceAccess_pkey" PRIMARY KEY ("email")
);
