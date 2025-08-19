<!-- File: TEST_PLAN.md | Purpose: End-to-end test checklist for ACORN Auction Platform -->
# ACORN Auction Platform — Test Plan

Use this checklist to verify core flows, real-time behavior, UI consistency, and error handling across frontend and backend. All paths are relative to the repo root.

Legend:
- [Automated] = Covered by backend Jest tests
- [Manual] = Needs manual/E2E verification

## Automated Tests

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

Run: from `backend/` run `yarn test`

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
- [ ] ACORN allocation shows with asterisk: `ACORN*`
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
- [ ] Estimated ACORN per pledge computed client-side from `auctionState`
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
