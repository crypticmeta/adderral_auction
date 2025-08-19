/*
  Warnings:

  - You are about to drop the column `hardCapBTC` on the `Auction` table. All the data in the column will be lost.
  - You are about to drop the column `initialMarketCap` on the `Auction` table. All the data in the column will be lost.

*/
-- First add the new columns
ALTER TABLE "public"."Auction" ADD COLUMN "ceilingMarketCap" DOUBLE PRECISION;
ALTER TABLE "public"."Auction" ADD COLUMN "refundedBTC" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Update existing data to set ceilingMarketCap to initialMarketCap value
UPDATE "public"."Auction" SET "ceilingMarketCap" = "initialMarketCap";

-- Make ceilingMarketCap NOT NULL after setting values
ALTER TABLE "public"."Auction" ALTER COLUMN "ceilingMarketCap" SET NOT NULL;

-- Now drop the old columns
ALTER TABLE "public"."Auction" DROP COLUMN "hardCapBTC";
ALTER TABLE "public"."Auction" DROP COLUMN "initialMarketCap";

-- CreateTable
CREATE TABLE "public"."RefundedPledge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "btcAmount" DOUBLE PRECISION NOT NULL,
    "depositAddress" TEXT NOT NULL,
    "txid" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auctionId" TEXT NOT NULL,
    "refundTxid" TEXT,
    "refunded" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RefundedPledge_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."RefundedPledge" ADD CONSTRAINT "RefundedPledge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RefundedPledge" ADD CONSTRAINT "RefundedPledge_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "public"."Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
