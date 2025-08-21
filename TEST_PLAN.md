<!-- File: TEST_PLAN.md | Purpose: Concise, automation-first test plan (v1.0) for Adderrels Auction -->
## 3.1) Automated Frontend Tests (Jest + RTL)

Existing:
- [x] `frontend/src/__tests__/pledgeFlow.ui.test.tsx`
  - Verifies pledge lifecycle across `PledgeQueue`, `RecentActivity`, and `AuctionStatus` using mocked fetch and WebSocket.
  - Uses fake timers to advance the 300ms debounce in `PledgeQueue` and `within()` to scope assertions.

- [x] `frontend/src/__tests__/pledgeQueue.states.test.tsx`
  - Loading/empty/error states; fetch error/user messaging; missing auctionId guard.
- [x] `frontend/src/__tests__/recentActivity.rules.test.tsx`
  - Max 10 items, sorted by timestamp desc; exact badge rendering for refunded/confirmed.
  - Avatar seed stability (DiceBear) derived from address; BTC address truncation rules.
- [x] `frontend/src/__tests__/pledgeInterface.validation.test.tsx`
  - Wallet connection gating; min/max validation; balance gating; estimated tokens display rules.
- [x] `frontend/src/__tests__/environmentGuard.banner.test.tsx`
  - Backend status fetch error overlay; environment mismatch banner; scoped queries.
- [x] `frontend/src/__tests__/auctionStatus.updates.test.tsx`
  - Connection/loading banners; active/ended banners; progress bar and formatted totals.

Newly added edge-case tests:
- [x] `frontend/src/__tests__/pledgeQueue.websocket.reconnect.test.tsx`
  - Simulates WS-driven queue updates (reconnect/change) and asserts refetch behavior.
- [x] `frontend/src/__tests__/recentActivity.transitions.test.tsx`
  - Mixed refunded/confirmed items and transition from confirmed → refunded with rerender.
- [x] `frontend/src/__tests__/websocketContext.reconnect.test.tsx`
  - Connect → auth → disconnect → timed reconnect → auth; asserts context flags update.

How to run:
```bash
cd frontend
yarn test
```

Planned next tests (frontend):
- Optional a11y assertions (low priority): role-based queries for banners/lists; focus management on error overlays.

### Next Up (shortlist)
- [x] [frontend] Unit tests for `WebSocketContext` reconnect flow (re-subscribe/state reset on reconnect).
- [x] [frontend] Avatar seed/truncation assertions in `recentActivity.rules.test.tsx`.
- [frontend] Test util for fake clock helpers (advance 300ms debounce) to reduce duplication.
- [backend] Tests for `GET /api/pledges/max-pledge/:auctionId` success and error handling (400/404) and numeric bounds.
- [backend] Tests for `GET /api/auction/:id/stats` shape and caching semantics (Redis set/get).
- [ci] Enforce Jest coverage thresholds: 70% lines/branches frontend; 70% backend to start.


# Test Plan v1.0 (Automation-first)

Goals:
- Maximize automated coverage; keep manual checks minimal.
- Validate multi-wallet pledge creation persists full user details.
- Validate key UI states and accessibility quickly.

## 1) Scope & Modes

- Backend: Express + Socket.IO + Prisma (Postgres) + Redis.
- Frontend: Next.js + TypeScript + Tailwind.
- Tests run in two modes:
  - Default: Testcontainers (ephemeral Postgres/Redis).
  - Local: persistent services via `backend/docker-compose.test.yml` with `USE_LOCAL_SERVICES=true`.

## 2) Environment & Setup

- Required envs: `DATABASE_URL`, `REDIS_URL`, `BTC_DEPOSIT_ADDRESS`, JWT, network flags.
- Local mode requires manual Prisma steps: `yarn prisma:generate && yarn prisma:migrate && yarn seed`.
- Run tests:
  - Ephemeral: `yarn test` (from `backend/`, Docker required).
  - Local: `yarn services:up` → set envs → `yarn test:local` → `yarn services:down`.

## 3) Automated Backend Tests

Existing:
- [x] `src/tests/bitcoinPriceService.test.ts`: cache TTLs (short/long), live HTTP sources.
- [x] `src/tests/scheduledTasks.test.ts`: immediate refresh, warm-threshold, interval unref safety.
- [x] `src/tests/socketHandler.price.test.ts`: `priceError` semantics and computed fields.

New (added):
- [x] `src/tests/statusRoutes.test.ts`: `GET /api/status` returns `{ network, testing, nodeEnv, btcUsd }` with btcUsd as number|null.
- [x] `src/tests/socketHandler.payload.test.ts`:
  - Validates `auction_status` payload completeness: `id, totalTokens, ceilingMarketCap, currentMarketCap, refundedBTC, minPledge, maxPledge, startTime, endTime, serverTime, remainingTime, ceilingReached, currentPrice, priceError, pledges[]` (with user addresses).
  - Scenarios:
    - price available → `priceError=false`, computed fields > 0 as expected.
    - price unavailable → `priceError=true`, price-dependent fields zeroed.
    - ceiling reached → `ceilingReached=true` when `totalBTCPledged * price >= ceilingMarketCap`.
 - [x] `src/tests/pledgeFlow.e2e.test.ts`:
   - End-to-end pledge creation: `POST /api/pledges` → 201 with canonical `satsAmount` and `queuePosition`.
   - Persists DB row (`Pledge`) with txid and wallet details; enqueues in Redis sorted set (`auction:pledge:queue`).
   - Emits WS events: `pledge_created` and `pledge:queue:position`.
   - Allows multiple pledges from same user (no unique constraint on `(userId, auctionId)`).
   - Rejects 400 on missing required fields (null checks for `userId`, `satsAmount`, `walletDetails`, `txid`).

Planned next tests (backend):
- Pledge queue endpoints and limits:
  - `GET /api/auction/:id/stats` returns stats for seeded auction.
  - `GET /api/pledges/auction/:auctionId` returns queue with user addresses.
  - `GET /api/pledges/max-pledge/:auctionId` returns min/max and USD equivalents; graceful 404/400 handling.
- Auth:
  - `POST /api/auth/guest-id` returns `{ guestId }`; rejects with 400 when unexpected body is provided.
- Pledge validations:
  - Reject below-min / above-max, duplicate constraints (where applicable), and missing txid.

## 4) Critical End-to-End Validations (Automated-first)

- Multi-wallet pledge persistence (critical):
  - Controller test: `POST /api/auction/connect-multi-wallet` stores both cardinal and ordinal details on `User` (with null checks).
  - Pledge creation test: `POST /api/pledges` persists `Pledge` with full `walletDetails`, `txid`, and associates user addresses.
  - WS: `auction_status.pledges[]` includes `cardinal_address` and `ordinal_address` for recent pledges.

## 5) Minimal Manual Checks (only what can’t be unit-tested fast)

- WebSocket Debug Window (dev): appears when `NEXT_PUBLIC_APP_ENV=development`; logs events and actions function.
- UI critical paths (visual and a11y spot-check):
  - Pledge form disables when `priceError=true`; re-enables on recovery.
  - Countdown shows non-negative time and ticks; progress bar updates with WS events.
  - Recent Activity displays 10 items max, badges correct, avatars seeded by address.

## 6) Frontend Unit Targets (fast, automated)

- Null-safety of key components (`AuctionStatus`, `PledgeQueue`, `PledgeInterface`): render without crash when props/state are null/undefined.
- Countdown formatter edge cases: `0`, `<1s`, `>24h`.
- Recent Activity merging and sorting by time; limit to 10; badge logic.

## 7) How to Run

- Backend ephemeral: `yarn test`.
- Backend local: `yarn services:up` → set `DATABASE_URL`/`REDIS_URL` → `yarn prisma:generate && yarn prisma:migrate && yarn seed` → `yarn test:local` → `yarn services:down`.
- Troubleshooting: `yarn test --detectOpenHandles` for leaked handles.

Frontend:
```bash
cd frontend
yarn test
```

Setup notes:
- Jest setup suppresses the expected env warning from `PledgeQueue.tsx` about `NEXT_PUBLIC_API_URL` defaulting; other warnings are forwarded. See `frontend/jest.setup.ts`.

## 8) CI Criteria

- All backend suites pass in ephemeral mode on clean environment.
- Flake-free within 2 retries; no leaked handles.
- Documentation parity: README reflects test modes and new test files.
- Frontend Jest suite passes consistently (no act/timer leaks), stable across Node 20.
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
