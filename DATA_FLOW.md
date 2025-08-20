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

4) Fetch Deposit Address (HTTP)
- Endpoint: `GET /api/pledges/deposit-address` → `getDepositAddress()`.
- Returns a single global `depositAddress` sourced from env `BTC_DEPOSIT_ADDRESS` and the active auction `network`.

5) Pay BTC, Then Create Pledge (HTTP)
- Wallet pays the returned `depositAddress`; wallet returns a `txid`.
- Endpoint: `POST /api/pledges` → `createPledge()`.
- __Body required__: `{ userId, btcAmount, walletInfo, depositAddress, txid }`.
- Validates min/max and requires `txid`. Creates `Pledge` with `status='pending'`, `confirmations=0`, `verified=false`.
- Enqueues pledge to Redis ZSET by `timestamp`; emits `pledge_created` and `pledge:queue:position`.

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

## API Routes (Backend)

This section enumerates all Express routes mounted in `backend/src/server.ts` and implemented under `backend/src/controllers/*` and `backend/src/routes/*`.

### Base paths
- `app.use('/api/auth', authRoutes)` from `backend/src/server.ts`
- `app.use('/api/auction', auctionRoutes)` from `backend/src/server.ts`
- `app.use('/api/pledges', pledgeRoutes)` from `backend/src/server.ts`

---

### Auth (`/api/auth/*`)

* __POST `/api/auth/guest-id`__ → `getGuestId()`
  - __Body__: none
  - __Returns__: `{ guestId: string }`
  - __Notes__: Stateless ID for guests (used by client for WS usage). No model persistence.

* __GET `/api/auth/health`__ → `healthCheck()`
  - __Returns__: `{ status: 'ok', message: string }`

---

### Auction (`/api/auction/*`)

Models used: `Auction`, `Pledge`, `User` (see Models section below).

* __GET `/api/auction/`__ → `getAllAuctions()`
  - __Query__: none
  - __Returns__: `Auction[]` (all model fields)

* __GET `/api/auction/search`__ → `searchAuctions()`
  - __Query__:
    - `query?: string` — search basis: `Auction.id` case-insensitive contains
    - `isActive?: 'true'|'false'`
    - `isCompleted?: 'true'|'false'`
  - __Returns__: `Auction[]` plus Prisma `_count: { pledges: number }`
  - __Not returned__: no pledge rows inline (only `_count`).

* __GET `/api/auction/:id`__ → `getAuction()`
  - __Params__: `id: string`
  - __Returns__: `Auction` with `pledges[]` including `user` limited fields
    - Pledge includes `user.select = { id, cardinal_address, ordinal_address, cardinal_pubkey, network }`
  - __Not returned__: other `User` fields like `wallet`, `connected`, `signature`, `message`, `createdAt`.

* __GET `/api/auction/:id/stats`__ → `getAuctionStats()`
  - __Params__: path is `:id` in router, controller reads `auctionId` (treated equivalently)
  - __Returns__:
    - `{ auctionId, totalTokens, isActive, isCompleted, ceilingMarketCap, currentMarketCap, ceilingReached, totalBTCPledged, percentageFilled, pledgeCount, averagePledge, largestPledge, smallestPledge, uniqueParticipants, refundedPledgeCount, refundedBTC, startTime, endTime, timeRemaining }`

* __GET `/api/auction/:auctionId/pledges`__ → `getAuctionPledges()`
  - __Params__: `auctionId: string`
  - __Returns__: `Pledge[]` ordered by `timestamp desc` with `user.select = { id, cardinal_address, ordinal_address, cardinal_pubkey, ordinal_pubkey, wallet, network }`

* __POST `/api/auction/`__ (auth) → `createAuction()`
  - __Body required__: `{ totalTokens: number|string, ceilingMarketCap: number|string, startTime: ISODate, endTime: ISODate }`
  - __Body optional__: `{ minPledgeSats?: number, maxPledgeSats?: number }` (defaults: 100_000 and 50_000_000)
  - __Returns__: created `Auction`

* __PATCH `/api/auction/:id/status`__ (auth) → `updateAuctionStatus()`
  - __Params__: `id: string`
  - __Body__: `{ isActive?: boolean, isCompleted?: boolean }` (at least one required)
  - __Returns__: updated `Auction`

* __POST `/api/auction/connect-multi-wallet`__ (auth) → `connectMultiWallet()`
  - __Body required__: `{ userId: string, btcAddress: string, taprootAddress: string, publicKey: string }`
  - __Body optional__: `{ ordinalPubKey?: string, wallet?: string, network?: string, signature?: string, message?: string }`
  - __Behavior__: Always upserts both addresses and metadata on the `User` and sets `connected=true`. Fails with 404 if user does not exist.
  - __Returns__: subset of `User`:
    `{ id, cardinal_address, ordinal_address, cardinal_pubkey, ordinal_pubkey, wallet, network, connected }`

* __GET `/api/auction/user/:userId/auction/:auctionId/allocation`__ (auth) → `getUserAllocation()`
  - __Params__: `userId: string`, `auctionId: string`
  - __Returns__:
    - `{ userId, auctionId, userTotal, totalRaised, allocationPercentage, pledgeCount, refundedPledgeCount, refundedTotal, tokenAllocation, hasRefunds }`

* __POST `/api/auction/reset`__ (dev-only) → `resetAuction()`
  - __Middleware__: `verifyAdminAccess`
  - __Returns__: `{ message, auction, adminId }` and resets DB + Redis; reseeds sample data.

* __POST `/api/auction/reseed`__ (dev-only) → `reseedDb`
  - __Middleware__: `verifyAdminAccess`
  - __Note__: Helper for reseeding; details implemented in `./routes/api/auction/reset` utilities referenced by router.

---

### Pledges (`/api/pledges/*`)

* __GET `/api/pledges/deposit-address`__ → `getDepositAddress()`
  - __Returns__: `{ depositAddress, network }` where `depositAddress` is read from env `BTC_DEPOSIT_ADDRESS`.

* __POST `/api/pledges`__ → `createPledge()`
  - __Body required__: `{ userId: string, btcAmount: number|string, walletInfo: { address?: string }, depositAddress: string, txid: string }`
  - __Behavior__: Validates against active `Auction` min/max (sats converted to BTC). Requires `txid`. Creates `Pledge` with pending status, enqueues to Redis, broadcasts.
  - __Returns__: created `Pledge` `+ { queuePosition: number }` including `user` relation.

* __GET `/api/pledges/auction/:auctionId`__ → `getPledges()`
  - __Params__: `auctionId: string`
  - __Returns__: `Pledge[]` where `verified=false`, ordered by `timestamp asc`, each enriched with `{ queuePosition, processed, needsRefund }` and `user.select = { cardinal_address, ordinal_address }`.

* __GET `/api/pledges/user/:userId/auction/:auctionId`__ → `getUserPledges()`
  - __Params__: `userId: string`, `auctionId: string`
  - __Returns__: `Pledge[]` ordered by `timestamp asc`, each enriched with `{ queuePosition, processed, needsRefund }`.

* __GET `/api/pledges/auction/:auctionId/cardinal/:cardinalAddress`__ → `getUserPledgesByCardinal()`
  - __Params__: `auctionId: string`, `cardinalAddress: string`
  - __Returns__: `Pledge[]` for that cardinal address in the auction, ordered by `timestamp asc`, enriched with `{ queuePosition, processed, needsRefund }`.

* __GET `/api/pledges/max-pledge/:auctionId`__ → `calculateMaxPledge()`
  - __Params__: `auctionId: string`
  - __Returns__: `{ minPledge, maxPledge, currentBTCPrice, minPledgeUSD, maxPledgeUSD }`

* __POST `/api/pledges/process-next/:auctionId`__ → `processNextPledge()`
  - __Params__: `auctionId: string`
  - __Returns__: dequeued pledge summary `{ id, userId, btcAmount, auctionId, timestamp, sender, depositAddress, signature, processed }` and emits `pledge:processed`.

* __GET `/api/pledges/stats`__ → `getPledgeStats()`
  - __Returns__: `{ scope: { type: 'active_auction' | 'all', auctionId? }, totals: { last24h, last48h, last72h }, generatedAt }`

---

### Wallet routes declared but not mounted

`backend/src/controllers/routes/walletRoutes.ts` declares:
- POST `/connect` → `walletController.connectWallet`
- POST `/disconnect` → `walletController.disconnectWallet`
- GET `/details/:userId` → `walletController.getWalletDetails`

These are not mounted in `server.ts` and are therefore not accessible via HTTP in the current setup.

---

## Models (Prisma schema)

Source: `backend/prisma/schema.prisma`.

* __User__
  - Fields: `id`, `cardinal_address?`, `ordinal_address?`, `cardinal_pubkey?`, `ordinal_pubkey?`, `wallet?`, `signature?`, `message?`, `network?`, `connected`, `createdAt`, relations: `pledges[]`, `refundedPledges[]`.

* __Auction__
  - Fields: `id`, `totalTokens`, `ceilingMarketCap`, `totalBTCPledged`, `refundedBTC`, `startTime`, `endTime`, `isActive`, `isCompleted`, `minPledgeSats`, `maxPledgeSats`, `network`, relations: `pledges[]`, `refundedPledges[]`.

* __Pledge__
  - Fields: `id`, `userId`, `satAmount`, `depositAddress`, `txid?`, `fee?`, `confirmations?`, `cardinal_address?`, `ordinal_address?`, `status`, `signature?`, `timestamp`, `verified`, `processed`, `needsRefund`, `auctionId`, `network`.
  - Constraint: `@@unique([auctionId, userId])`.

* __RefundedPledge__
  - Fields: `id`, `userId`, `btcAmount`, `depositAddress`, `txid?`, `timestamp`, `auctionId`, `refundTxid?`, `refunded`.

---

## Returned vs Omitted Fields (by endpoint)

- __getAuction(`/api/auction/:id`)__ returns `Auction` + `pledges` with nested `user` limited to `{ id, cardinal_address, ordinal_address, cardinal_pubkey, network }`. User fields like `wallet`, `signature`, `message`, `connected`, `createdAt` are omitted.
- __getAuctionPledges(`/api/auction/:auctionId/pledges`)__ returns full `Pledge` rows; nested `user` selected `{ id, cardinal_address, ordinal_address, cardinal_pubkey, ordinal_pubkey, wallet, network }`.
- __createPledge__ includes the `user` relation and returns most `Pledge` fields including `depositAddress`, `txid`, status/confirmations.
- __searchAuctions__ returns `Auction` rows plus `_count.pledges`; no pledge arrays inline.
- __connectMultiWallet__ returns subset of `User`: `{ id, cardinal_address, ordinal_address, cardinal_pubkey, ordinal_pubkey, wallet, network, connected }`.

---

## Search Behavior

- Endpoint: `GET /api/auction/search`
  - Search basis: `Auction.id` case-insensitive substring via `where.OR = [{ id: { contains: query, mode: 'insensitive' } }]`.
  - Filters: `isActive`, `isCompleted` booleans (string query params `'true'|'false'`).

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
2. User fetches deposit address → pays wallet → obtains `txid`.
3. Client creates pledge with `txid` → DB insert pending → Redis enqueue → `pledge_created` + queue position.
4. Background checker confirms → `verified=true` → `pledge_verified`.
5. Operator processes next pledge → updates auction totals or flags refund → `pledge:processed`.
6. Auction ends by time or ceiling → `auction_status` reflects completion.

## Operational Considerations
- Intervals use `.unref()` to avoid test leaks; stop functions exist for tests.
- Redis and Postgres must be reachable; prefer containerized infra for tests.
- Provide envs: `PORT`, `DATABASE_URL`, `REDIS_URL`, JWT, and:
  - `BTC_DEPOSIT_ADDRESS` (single global deposit address used for all payments).
  - `TESTING`, `MEMPOOL_MAINNET_BASE`, `MEMPOOL_TESTNET_BASE`.
- Do not hardcode secrets; see `backend/src/config/config.ts`.
