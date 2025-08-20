<!-- This file documents the end-to-end data flow of the Adderrels Auction platform. -->

# Adderrels Auction – End-to-End Data Flow

This document outlines how data moves across the system: frontend (Next.js), backend (Express + Prisma), Redis (queue/cache), Postgres (DB), WebSockets, and external services (mempool.space, price APIs).

## High-level Components
- Frontend (`frontend/`): Next.js + TypeScript + TailwindCSS UI.
- Backend (`backend/`): Express + TypeScript + Socket.IO + Prisma.
- Database: Postgres via Prisma ORM.
- Cache/Queue: Redis (pledge queue, caches, socket adapter).
- External APIs: mempool.space (tx status), exchanges (BTC price).

## Core Entities
- `Auction` (DB): auction configuration/status (ceilings, min/max in sats, timing, network).
- `Pledge` (DB): user pledge (amount in sats, txid, status, confirmations, verified, processed, refund flags, network).
- `RefundedPledge` (DB): tracked refunds when ceiling exceeded.
- Redis keys:
  - `auction:pledge:queue` (ZSET, score=timestamp ms) – FCFS queue.
  - `auction:pledge:processed` (SET) – processed pledges snapshot.
  - `btc:price:usd` (+ long cache) – price caching.

## Primary Flows

1) Authentication (Guest)
- User requests `POST /api/auth/guest-token`.
- Backend issues a JWT for client to open WebSocket + call APIs.

2) WebSocket Init
- Frontend connects via Socket.IO and authenticates.
- Backend emits periodic `auction_status` payloads with auction fields and price.

3) Wallet Connect (Frontend)
- User connects via supported wallet; UI records network and addresses.
- Balance UI uses adapter hooks (frontend only) and shows BTC/USD equivalents.

4) Create Pledge (HTTP)
- Endpoint: `POST /api/pledges` → `createPledge()`.
- Validates min/max (in BTC at edges; stored in sats in DB).
- Creates DB row `Pledge` with:
  - `satAmount`, `auctionId`, `userId`, `depositAddress`, `signature`, `cardinal_address`, `ordinal_address`, `network` (inherited from `Auction`).
- Enqueues pledge in Redis ZSET with `timestamp` score for FCFS.
- Emits `pledge_created` and `pledge:queue:position`.

5) User Provides txid (Verify Pledge)
- Endpoint: `POST /api/pledges/verify` → `verifyPledge()`.
- Stores `txid`, initial `status`, `fee`, `confirmations` (simulated at this step).
- Emits `pledge_verified` if already confirmed (rare; usually pending until background checker).

6) Background – Tx Confirmation Checker
- Service: `backend/src/services/txConfirmationService.ts`.
- Scheduled by `startTxConfirmationChecks(io)` every 30s.
- For unverified pledges with a `txid`:
  - Picks mempool base using `Pledge.network` (MAINNET/TESTNET).
  - Calls `/tx/:txid` and `/tx/:txid/status` on mempool.space.
  - Updates pledge `status`, `confirmations`, `fee` (if present), sets `verified=true` when confirmed.
  - Emits `pledge_verified` via WebSocket.
- TESTING mode (`TESTING=true`): randomly marks confirmations to simulate flows.

7) FCFS Queue Processing
- Admin/operator (or automation) triggers `POST /api/pledges/process-next/:auctionId`.
- `PledgeQueueService.processNextPledge()` pops the earliest pledge from Redis.
- If adding this pledge would exceed `Auction.ceilingMarketCap`, marks `needsRefund=true`.
- Updates DB:
  - If not refunding, increments `Auction.totalBTCPledged`.
  - Marks `Pledge.processed=true` and persists `needsRefund`.
- Emits `pledge:processed` and broadcasts queue update.

8) Auction Status + Price Refresh (Background)
- `startAuctionTimeCheck()` every 1m: flips `isActive/isCompleted` when end time reached; broadcasts.
- `startBitcoinPriceRefresh()` every 15m (with warm TTL logic): updates Redis caches; broadcasts price-dependent fields in `auction_status`.

9) Refund Handling (When Needed)
- Excess pledges flagged `needsRefund=true`.
- Out-of-band refund executor sends BTC back and records a `RefundedPledge` with `refundTxid` and `refunded=true` when completed.

## Supporting Endpoints
- `GET /api/auction/status` – public auction snapshot.
- `GET /api/pledges/stats` – totals last 24/48/72h (scoped to active auction when present).
- `GET /api/pledges/:auctionId` – unverified pledges + queue positions/status.
- `GET /api/pledges/user/:userId/:auctionId` – user-specific pledges with queue metadata.
- `GET /api/pledges/max-pledge/:auctionId` – safe max pledge calculation considering queue + ceiling.

## External Integrations
- mempool.space (Mainnet/Testnet) – transaction status and fee reading.
- Price sources (Binance/Bitfinex/Huobi) – median BTC price, cached in Redis with short/long TTLs.

## Event Timeline (Typical)
1. User opens app → WebSocket connects → receives `auction_status`.
2. User pledges → DB insert → Redis enqueue → `pledge_created` + queue position.
3. User submits txid → pledge updated pending.
4. Background checker confirms → `verified=true` → `pledge_verified`.
5. Operator processes next pledge → updates auction totals or flags refund → `pledge:processed`.
6. Auction ends by time or ceiling → `auction_status` reflects completion.

## Operational Considerations
- Intervals use `.unref()` to avoid test leaks; stop functions exist for tests.
- Redis and Postgres must be reachable; prefer containerized infra for tests.
- Provide envs: `PORT`, `DATABASE_URL`, `REDIS_URL`, JWT, and:
  - `TESTING`, `MEMPOOL_MAINNET_BASE`, `MEMPOOL_TESTNET_BASE`.
- Do not hardcode secrets; see `backend/src/config/config.ts`.
