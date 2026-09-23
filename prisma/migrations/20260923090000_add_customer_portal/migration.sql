-- Add the customer-portal toggle to Setting (on by default = current behaviour).
ALTER TABLE "Setting" ADD COLUMN "customerPortal" BOOLEAN NOT NULL DEFAULT true;
