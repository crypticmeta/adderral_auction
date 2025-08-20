<!-- File: TEST_PLAN.md | Purpose: End-to-end test checklist for Adderrels Auction Platform -->
# Adderrels Auction Platform — Test Plan

Use this checklist to verify core flows, real-time behavior, UI consistency, and error handling across frontend and backend. All paths are relative to the repo root.

Legend:
- [Automated] = Covered by backend Jest tests
- [Manual] = Needs manual/E2E verification

## Automated Tests

All backend automated tests run against real services:
- Real Postgres and Redis via Testcontainers (ephemeral containers)
- Live HTTP requests for Bitcoin price (no mocks)
- Internet access and Docker daemon are required

### Bitcoin Price Service (Backend)
- [x] BTC price fetched and cached; values refresh every ~15 minutes [Automated]
- [x] If price fetch fails, backend sets `priceError: true` [Automated]
- Caching behavior (source: `backend/src/services/bitcoinPriceService.ts`)
  - Median across sources cached to `btc:price:usd` (30m) and `btc:price:usd:long` (3d)
  - Reads within TTL return cached value
  - `refreshBitcoinPrice()` overwrites both cache keys
- Scheduler cadence (source: `backend/src/services/scheduledTasks.ts`)
  - Runs on boot, then every 15 minutes
  - Warm threshold respected: if `ttl(btc:price:usd) > 300`, refresh is skipped
- Failure semantics (source: `backend/src/websocket/socketHandler.ts`)
  - On fetch failure, WS `auction_status` has `priceError: true`, `currentPrice: 0`, `currentMarketCap: 0`

Tests:
- `backend/src/tests/bitcoinPriceService.test.ts`
- `backend/src/tests/scheduledTasks.test.ts`
- `backend/src/tests/socketHandler.price.test.ts`

Run: from `backend/` run `yarn test` (ensure Docker is running and internet is available)

Environment & setup details:
- Global setup `backend/src/tests/setup/testcontainers.setup.ts` starts Postgres/Redis containers, sets env vars, and runs Prisma generate/migrate with detailed logs (`DEBUG=testcontainers*` optional)
- Per-test setup `backend/src/tests/setup/jest.setup.ts` truncates core tables and clears Redis keys between tests

Scheduler interval safety:
- Scheduler uses a 15m interval with `.unref()` and exposes `stopBitcoinPriceRefresh()`; tests call this in `afterEach` to prevent timer leaks

Troubleshooting:
- If Jest hangs or reports leaked handles, try `yarn test --detectOpenHandles`
- Verify Docker is running and images can be pulled; confirm outbound network for price APIs

### WebSocket Payload (Backend)
- Planned automated tests:
  - [ ] Validate completeness of `auction_status` payload fields across scenarios (active, ended, ceiling reached)
  - [ ] Verify `ceilingReached` toggles correctly as market cap crosses threshold
  - [ ] Ensure `remainingTime` and `serverTime` are consistent and non-negative

### Auction Status & Countdown (Backend + FE unit)
- Planned automated tests:
  - [ ] Backend computes countdown inputs consistently (server vs end time)
  - [ ] FE unit test: countdown formatter renders HH:MM:SS correctly for edge values (0, <1s, hours>24)

### Backend API (Controllers)
- Planned automated tests:
  - [ ] `GET /api/auction/status` returns comprehensive status and proper HTTP codes
  - [ ] `GET /api/pledges/auction/:auctionId` returns queue items including user addresses
  - [ ] `GET /api/pledges/max-pledge/:auctionId` returns limits; handles missing auction gracefully
  - [ ] `POST /api/auth/guest-token` issues token and rejects malformed requests

### Queue Events & Behavior (Backend)
- Planned automated tests:
  - [ ] Emission of `pledge_created`, `pledge:processed`, `pledge:queue:update` with correct payloads
  - [ ] Queue ordering preserved (FIFO) under concurrent inserts
  - [ ] Robustness when Redis temporarily errors (retry or safe logging)

### Pledge Flow (Validations & Refunds)
- Planned automated tests:
  - [ ] Server validation rejects out-of-range pledges (below min / above max)
  - [ ] Excess pledge marking when near/at ceiling; refund path signaled
  - [ ] Pledge triggers WS updates to progress metrics

### Refund Mechanics (Backend)
- Planned automated tests:
  - [ ] Excess pledge detection when near ceiling; marks refund correctly
  - [ ] Aggregation of `refundedBTC` reflected in stats and WS payload
  - [ ] No double-counting of refunds on repeated events

### Recent Activity (Frontend unit)
- Planned automated tests:
  - [ ] Merge/sort logic of queue + activity feed limited to 10 items
  - [ ] Badge logic: In Queue / Processed / Refunded / Confirmed
  - [ ] DiceBear avatar seeding stable by address (snapshot-friendly)

### Error Handling & Null-Safety (Frontend unit)
- Planned automated tests:
  - [ ] Key components render without crashing when props/state are null/missing (`AuctionStatus`, `PledgeQueue`, `PledgeInterface`)
  - [ ] User-friendly error banners/messages appear on network/API errors

## Manual Tests

### WebSocket & Debug Window
- Section default: [Manual]
- [x] When `NEXT_PUBLIC_APP_ENV=development`, Debug Window appears
- [x] Logs inbound/outbound/system/error events
- [x] Copy All and Clear actions work

### Auction Status & Countdown
- Section default: [Manual]
- [ ] `auction_status` payload includes `id`, `totalTokens`, `ceilingMarketCap`, `currentMarketCap`, `refundedBTC`, `minPledge`, `maxPledge`, `startTime`, `endTime`, `serverTime`, `ceilingReached` (core covered in automated WS test)
- [ ] Frontend reads `auctionState.id` for API routing
- [ ] Countdown synchronizes with `endTimeMs`/`serverTimeMs` and ticks smoothly
- [ ] Animated auction progress bar reacts to status updates

### Bitcoin Price Service (Frontend UI)
- Section default: [Manual]
- [ ] Frontend disables pledge UI and shows a banner until recovery [Manual]
  - [ ] Manual test steps
    - [ ] Clear caches and force a fetch: delete `btc:price:usd` and `btc:price:usd:long`; load app to trigger `auction_status`; verify caches are created
    - [ ] Verify TTLs: confirm `btc:price:usd` ≈ 1800s and `btc:price:usd:long` ≈ 259200s
    - [ ] Simulate failure: temporarily block outbound requests or point hosts to invalid endpoints; reload app; verify `priceError: true` in WS payload and logs
    - [ ] Recovery: restore network; wait for scheduler or trigger refresh; verify `priceError` flips to false and `currentPrice > 0`
  - [ ] Frontend UI behavior (source: `frontend/src/components/PledgeContainer.tsx`)
    - [ ] When `priceError` is true, a red banner shows: “Live BTC price is currently unavailable. Pledging is temporarily disabled.”
    - [ ] `PledgeInterface` receives `isWalletConnected && !priceError && isAuctionActive`; verify `button-pledge` is disabled while `priceError` is true and re-enables on recovery


### Pledge Flow (FCFS)
- Section default: [Manual]
- [ ] Connect a wallet (or guest auth) succeeds
- [ ] Create pledge within limits succeeds
- [ ] Pledge triggers real-time updates (progress bar, totals)
- [ ] Excess pledges over ceiling are marked for refund
- [ ] After processing, refunded amounts are reflected

### Queue Limits & Validation
- Section default: [Manual]
- [ ] `PledgeQueue` fetches min/max limits only via API `/api/pledges/max-pledge/:auctionId` (no WS fallback)
- [ ] UI shows subtle error note if limits cannot be fetched
- [ ] Client-side validation prevents out-of-range pledges

### Redis Pledge Queue Behavior
- Section default: [Manual]
- [ ] Pledges appear in queue in order
- [ ] WebSocket events fire:
  - [ ] `pledge_created`
  - [ ] `pledge:processed`
  - [ ] `pledge:queue:update`
- [ ] Queue position updates live
- [ ] Refund flag shown when applicable

### Recent Activity (Merged with Queue)
- Section default: [Manual]
Component: `frontend/src/components/recent-activity.tsx`
- [ ] Shows random avatars (DiceBear) seeded by address
- [ ] Displays truncated usernames from addresses
- [ ] Merges queue items with activity feed; sorted by time; limited to 10
- [ ] ADDERRELS allocation shows with asterisk: `ADDERRELS*`
- [ ] Footnote present: `* Estimated; final allocation may vary.`
- [ ] Tx Status badge for items:
  - [ ] Queue item pending → `In Queue`
  - [ ] Queue item processed → `Processed`
  - [ ] Queue item processed + refund → `Refunded`
  - [ ] Non-queue confirmed activity → `Confirmed`
- [ ] Live updates: on `pledge_created`, `pledge:processed`, `pledge:queue:update`, feed refreshes without page reload
- [ ] New items slide in (opacity/translate) upon arrival

### Pledge Queue UI
- Section default: [Manual]
Component: `frontend/src/components/PledgeQueue.tsx`
- [ ] Random avatars and truncated usernames visible
- [ ] Estimated ADDERRELS per pledge computed client-side from `auctionState`
- [ ] Real-time updates on queue events

### Pledge Form
- Section default: [Manual]
Component: `frontend/src/components/PledgeForm.tsx`
- [ ] Uses `auctionState.ceilingReached` (no `auctionStatus` reference)
- [ ] Fetches max pledge info via API (no WS fallback)
- [ ] Proper input validation and error handling

### Backend API
- Section default: [Manual]
- [ ] `GET /api/auction/status` returns comprehensive status
- [ ] `GET /api/pledges/auction/:auctionId` returns queue items with user addresses
- [ ] `GET /api/pledges/max-pledge/:auctionId` returns limits
- [ ] `POST /api/auth/guest-token` issues token

### Refund Mechanics
- Section default: [Manual]
- [ ] When ceiling would be exceeded, pledge marked excess
- [ ] Excess amounts refunded; reflected in totals and UI badges

### Auction End Conditions
- Section default: [Manual]
- [ ] Ends immediately when ceiling reached
- [ ] Ends at 72 hours otherwise
- [ ] UI reflects end state; pledging disabled

### Dev-only Reset (if enabled in your env)
- Section default: [Manual]
- [ ] Reset endpoint available only in non-production
- [ ] Triggering reset truncates core tables (`User`, `Auction`, `Pledge`, `RefundedPledge`) and reseeds admin + test data
- [ ] Redis auction caches (`auction:*`) are purged
- [ ] New 72-hour auction is created and broadcast to clients
- [ ] Frontend reset button visible in dev and functions without auth token
- [ ] Page reloads after reset

### Accessibility
- Section default: [Manual]
- [ ] Progress bar has correct role and ARIA attributes
- [ ] Color contrast meets basic readability standards

### Error Handling & Null-Safety
- Section default: [Manual]
- [ ] All pages/components render without crashing when data is null/missing
- [ ] Network/API errors display user-friendly messages

### Performance
- Section default: [Manual]
- [ ] No excessive WS messages or re-renders (check Dev Tools)
- [ ] List rendering capped (Recent Activity limit of 10)

### Documentation Parity
- Section default: [Manual]
- [ ] README’s described features are observable in the app
- [ ] Any new changes are reflected back into `README.md`

## User-Specified Real-World Test Runs

- [Overview] These are focused, end-to-end validations you asked to include. They complement sections above and should be tracked as explicit runs.

### 1) Automated APIs/Services
- Goal: Validate controllers, services, and integrations via automation.
- Method: Expand existing Jest suite using Supertest + Testcontainers for Postgres/Redis and live HTTP price fetches. Tag with `@api` to filter in CI.
- Exit criteria: All API endpoints and service behaviors in “Automated Tests” pass in CI on a clean environment.

### 2) WS-based UI Interaction (Multi-user)
- Goal: Verify real-time UI across multiple concurrent clients.
- Recommended method (better than multiple home devices): Playwright multi-context test
  - Spin up app once; create 2–4 browser contexts (simulated users) subscribing to the same WS.
  - Script pledges/status updates and assert synchronized UI (progress, queue, badges) without flakiness from LAN variances.
  - Optional: Run headed for observation; record traces/video.
- Optional real device check: one laptop + one phone on LAN as a sanity pass after Playwright is green.

### 3) Pledge Flow Using Test Data
- Goal: Validate full FCFS pledge lifecycle with safe data.
- Method: Use dev reset/seed to create a fresh 72h auction and test users; perform pledges within limits and near-ceiling to trigger refund paths.
- Assertions: Queue order preserved; WS events (`pledge_created`, `pledge:processed`, `pledge:queue:update`) fire; UI shows refunded/excess states; totals match.

### 4) Final Test on Testnet — 0.1 BTC in 3 Days
- Goal: Dress rehearsal on testnet with real wallets.
- Plan: Configure testnet endpoints/keys; open a 72h auction targeting 0.1 BTC; publicize only to test participants.
- Success: Auction ends at time or ceiling; aggregates and event logs consistent; no UI/WS regressions; postmortem metrics captured (latency, message rates, error banners, refund accounting).
