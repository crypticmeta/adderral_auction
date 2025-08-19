-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "cardinal_address" TEXT,
    "ordinal_address" TEXT,
    "cardinal_pubkey" TEXT,
    "ordinal_pubkey" TEXT,
    "wallet" TEXT,
    "signature" TEXT,
    "message" TEXT,
    "network" TEXT,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Pledge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "btcAmount" DOUBLE PRECISION NOT NULL,
    "depositAddress" TEXT NOT NULL,
    "txid" TEXT,
    "fee" DOUBLE PRECISION,
    "confirmations" INTEGER DEFAULT 0,
    "sender" TEXT,
    "recipient" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "signature" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "auctionId" TEXT NOT NULL,

    CONSTRAINT "Pledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Auction" (
    "id" TEXT NOT NULL,
    "totalTokens" DOUBLE PRECISION NOT NULL,
    "hardCapBTC" DOUBLE PRECISION NOT NULL,
    "initialMarketCap" DOUBLE PRECISION NOT NULL,
    "totalBTCPledged" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "minPledge" DOUBLE PRECISION NOT NULL,
    "maxPledge" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Pledge" ADD CONSTRAINT "Pledge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Pledge" ADD CONSTRAINT "Pledge_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "public"."Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
