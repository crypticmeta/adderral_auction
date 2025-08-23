/*
  Safe migration for tokensOnSale:
  1) Add column as nullable
  2) Backfill with totalTokens for existing rows
  3) Enforce NOT NULL
*/

-- 1) Add column as nullable first
ALTER TABLE "public"."Auction" ADD COLUMN "tokensOnSale" DOUBLE PRECISION;

-- 2) Backfill existing rows from totalTokens
UPDATE "public"."Auction" SET "tokensOnSale" = "totalTokens" WHERE "tokensOnSale" IS NULL;

-- 3) Enforce NOT NULL
ALTER TABLE "public"."Auction" ALTER COLUMN "tokensOnSale" SET NOT NULL;
