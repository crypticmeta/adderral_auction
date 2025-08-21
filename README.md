<!-- File: README.md | Purpose: Project overview, setup, and testing. Includes backend test isolation notes (global beforeEach truncation) and the beforeEach data-creation pattern. -->
## Shared Types

- Location: `shared/types/`
- Path aliases:
  - Frontend: `@shared/*` → `../shared/*` (configured in `frontend/tsconfig.json`)
  - Backend: `@shared/*` → `../shared/*` (configured in `backend/tsconfig.json`)
- Usage: import only types to avoid runtime resolution requirements. Example:
  ```ts
  import type { TimeRemaining, AuctionProgressProps } from '@shared/types/auction';
  ```
  Type-only imports are erased at build time and are safe in both projects.

### Common app types

- Additional shared types live in `shared/types/common.ts` (wallet metadata, pledge queue items, minimal auction shapes, etc.).
- Central barrel export: `shared/types/index.ts` so you can also do:
  ```ts
  import type { AuctionState, PledgeItem, WalletDetails } from '@shared/types';
  ```
- The legacy `frontend/src/types/` directory has been migrated/removed. All imports should use `@shared/types/*` going forward.

- Canonical wallet shape: `WalletDetails` in `shared/types/common.ts`
  - Matches bitcoin-wallet-adapter output: `{ cardinal, cardinalPubkey, ordinal, ordinalPubkey, connected, wallet, derivationPath? }`
  - Use `WalletDetails` across frontend and backend. Backend `createPledge` accepts `walletDetails` directly. The legacy `WalletInfo` has been removed.
A new background task now verifies pledge txids against mempool.space and marks pledges as verified when confirmed. Configurable via env (see Backend runtime/env notes).

- **Tx Confirmation Service (background)**
  - New service `backend/src/services/txConfirmationService.ts` checks pending pledges with a `txid` and updates `status`, `confirmations`, `fee`, and `verified`.
  - Scheduled every 30s via `startTxConfirmationChecks(io)` in `backend/src/services/scheduledTasks.ts` and wired in `backend/src/server.ts`.
  - Network routing: uses `Pledge.network` (Prisma enum `BtcNetwork`) to pick mainnet vs testnet mempool base.
  - Testing mode: when `TESTING=true`, returns random confirmations to simulate flow without hitting mempool.
  - WebSocket: emits `pledge_verified` on confirmation via `broadcastPledgeVerified()`.

 - **Frontend UI Improvements**:
  - Set app favicon to `/public/adderrel.png` via Next.js metadata in `frontend/src/app/layout.tsx` (will switch after asset rename)
  - Configured `WalletProvider` to accept and pass `customAuthOptions` to `bitcoin-wallet-adapter` with Adderrels icon
  - Default network is `mainnet`; override via `customAuthOptions` if needed
  - Auction Progress bar formatting/accessibility improvements (Intl formatting, ARIA valuetext, clamped display percent)
  - Removed refund display from UI; refunds (if any) are handled manually by the team and not surfaced in the interface
  - Auction Stats numbers now use compact formatting (Intl):
    - Tokens: K/M/B automatically (no fixed `M` suffix). Implemented in `frontend/src/components/auction-stats.tsx`.
    - USD values: compact currency, e.g. `$5K`, `$15M`.
    - Null-safe parsing with fallbacks.
  - Pre-start behavior: before the auction start time, the UI now shows a "Starts In" countdown (including days when >24h), hides the progress bar and raised stats, and disables the pledge interface.
# Adderrels Auction Platform

## Recent Updates
- **API change: Wallet connect**
  - Removed single-wallet endpoint `POST /api/auction/connect-wallet`.
  - Standardized on `POST /api/auction/connect-multi-wallet` which now always upserts both addresses and metadata on `User`.
  - Request body: `{ userId, btcAddress, taprootAddress, publicKey, ordinalPubKey?, wallet?, network?, signature?, message? }`
  - Response: `{ id, cardinal_address, ordinal_address, cardinal_pubkey, ordinal_pubkey, wallet, network, connected }`
  - Motivation: Store all information provided by bitcoin-wallet-adapter (cardinal + ordinal).
 - **API change: Pledges (pay-first flow, single deposit address)**
  - Get deposit address: `GET /api/pledges/deposit-address` → returns `{ depositAddress, network }` where `depositAddress` is read from env `BTC_DEPOSIT_ADDRESS`.
  - Create pledge after payment: `POST /api/pledges/` with canonical satoshi amount. Body:
    - Required: `{ userId: string, satsAmount: number, walletDetails: WalletDetails, txid: string }`
    - Optional (back-compat/UI): `{ btcAmount?: number, depositAddress?: string }`
  - Fetch pledges by cardinal address for an auction: `GET /api/pledges/auction/:auctionId/cardinal/:cardinalAddress`.
  - Frontend fetches the deposit address, triggers wallet payment, obtains `txid`, then creates the pledge. The backend scheduler confirms on-chain; there are no verify/attach endpoints.
- **Backend stability fixes**
  - Implemented Prisma client singleton at `backend/src/config/prisma.ts` and refactored all usages to prevent connection pool exhaustion (timeouts P2024).
  - Added Redis error handlers to Socket.IO Redis adapter clients in `backend/src/websocket/socketHandler.ts` to avoid unhandled connection errors.
  - Gracefully handle duplicate pledge attempts (Prisma P2002) in `backend/src/controllers/pledgeController.ts#createPledge` by returning HTTP 409 with a helpful message.
  - Refactored services and controllers to import the singleton: `auctionController.ts`, `scheduledTasks.ts`, `txConfirmationService.ts`, `walletController.ts`, `routes/api/auction/reset.ts`.
  - Removed unused Prisma imports where applicable (e.g., `pledgeQueueService.ts`).
- **Auction Min/Max in Sats (breaking change)**
  - Replaced `Auction.minPledge`/`maxPledge` (BTC float) with `minPledgeSats`/`maxPledgeSats` (Int, sats) in `backend/prisma/schema.prisma`.
  - Backend controllers and WebSocket outputs now convert sats -> BTC only for responses.
  - Seed uses sats for min/max and for pledges.
  - Migration backfills new columns from existing BTC floats then drops old columns.
  - After pulling: run `yarn prisma:generate && yarn prisma:migrate && yarn seed` from `backend/`.
- **Schema: Network + Pledge fields**
  - Added Prisma `enum BtcNetwork { MAINNET, TESTNET }`.
  - `Auction.network: BtcNetwork @default(TESTNET)`.
  - `Pledge.network: BtcNetwork @default(TESTNET)`.
  - Replaced `Pledge.btcAmount: Float` with `satAmount: Int` (store sats, avoid float).
  - Renamed `Pledge.sender -> cardinal_address` and `recipient -> ordinal_address`.
  - Enforced one pledge per user per auction via `@@unique([auctionId, userId])`.
  - Migration required (see below).
- **Pledge UI: Wallet Balance Display**
  - `frontend/src/components/PledgeInterface.tsx` now shows connected wallet balance in BTC and approx USD using `useWalletBalance()` from `bitcoin-wallet-adapter`.
  - Added null checks, manual refresh, and disables pledging when input exceeds confirmed balance.
- **Removed Demo/Mock Code (Frontend)**
  - Eliminated mock verification flow from `frontend/src/components/PledgeForm.tsx`.
  - Users now paste a real on-chain txid to verify pledges; no placeholders.
  - Cleaned demo-related comment wording in `frontend/src/components/auction-progress.tsx`.
  - Ensured null-safety and production-ready UI copy (no demo/preview mentions).

- **Pledge pay-first flow (Frontend)**
  - `PledgeForm.tsx` integrates `usePayBTC()` from `bitcoin-wallet-adapter`.
  - Flow: fetch deposit address → `payBTC({ address, amount, network })` → obtain `txid` from wallet → `POST /api/pledges` with `txid` and `depositAddress`.
  - Robust null checks; pledge creation is blocked if wallet does not return a `txid`.
  - Testing mode remains unchanged and may bypass real payment.

- **Public Stats Page + Endpoint**
  - New Next.js page at `/stats` shows total BTC pledged in the last 24h, 48h, and 72h.
  - Backend public endpoint `GET /api/pledges/stats` returns these totals (scoped to active auction if present; otherwise across all).
  - Files: `frontend/src/app/stats/page.tsx`, `backend/src/controllers/pledgeController.ts#getPledgeStats`, `backend/src/routes/pledgeRoutes.ts`.

- **Backend Tests: Real Services via Testcontainers (Live HTTP)**
  - Jest runs against real Postgres and Redis containers (ephemeral) using Testcontainers
  - Bitcoin price service tests perform real HTTP calls (no mocks) and assert Redis cache TTLs
  - Scheduled tasks use a leak-safe interval with `.unref()` and expose `stopBitcoinPriceRefresh()` for tests
  - Detailed logs added to global setup; Prisma generate/migrate executed automatically
  - Tx confirmation scheduler test verifies pending vs confirmed txids using live mempool.space
- **Animated Auction Progress Bar (Live-reactive)**
  - Lively gradient fill with shimmer and subtle bump on pledge-driven increases
  - Reacts in real time to `auction_status` WebSocket updates
  - Files: `frontend/src/components/auction-progress.tsx`, `frontend/src/app/globals.css`
  - Accessible with `role="progressbar"` and ARIA values
- **Backend: Multiple pledges per user**
  - Removed unique constraint on `Pledge` (`@@unique([auctionId, userId])`) to allow multiple pledges from the same user (identified by cardinal address) within a single auction.
  - Run migrations from `backend/`:
    ```bash
    yarn prisma:generate
    yarn prisma:migrate
    ```
  - Controllers currently do not block duplicates; no code changes required.
- **UI change: Removed Raised-So-Far card**
  - The highlighted stat card showing total BTC raised was removed from `AuctionStats` (auction progress is visible elsewhere).
  - Prop `totalRaisedBTC` has been dropped from `AuctionStats` and its usage removed in `page.tsx`.
  - Files: `frontend/src/components/auction-stats.tsx`, `frontend/src/app/page.tsx`
- **UI: Recent Activity usernames**
  - Recent Activity now derives usernames and avatars strictly from the user's `cardinal_address`.
  - Queue items and the UI's recent activity feed use `cardinal_address` for display; safe fallbacks remain when null.
  - File: `frontend/src/components/recent-activity.tsx`.
  - The frontend now derives Recent Activity exclusively from the `pledges` array in `auction_status`.
- **Footer UI Polish**
  - Glass-card footer with rounded top, blur, and clearer border for readability
  - File: `frontend/src/app/page.tsx`
- **WS Payload: Auction ID**
  - `auction_status` now includes `id` (active auction ID)
  - Frontend reads `auctionState.id` to route API calls
  - `auction_status` payload is now simplified: it includes a canonical `pledges` array only. The frontend derives Recent Activity from the last N pledges and uses `cardinal_address` for usernames/avatars.
- **Queue Limits Fetching**
  - `PledgeQueue` no longer falls back to WS data for min/max limits
  - It uses `/api/pledges/max-pledge/:auctionId` exclusively and shows a subtle error note if unavailable
- **Synchronized Countdown + Richer WS Payload**
  - Backend `auction_status` now includes: `totalTokens`, `ceilingMarketCap`, `currentMarketCap`, `refundedBTC`, `minPledge`, `maxPledge`, `startTime`, `endTime`, `serverTime`, and `ceilingReached`.
  - Frontend countdown now ticks locally but is synchronized using `endTimeMs` and `serverTimeMs` for consistency across all clients.
  - UI totals read from server (no longer default to 0 when present).
- **Safety: Removed BTC Price Fallback**
  - Removed unsafe `$60,000` BTC fallback in backend price service.
  - When price cannot be fetched, backend marks `priceError: true` in `auction_status` and sets `currentPrice`-dependent values conservatively.
  - Frontend disables pledge UI and shows a banner until price recovers.
  - Automated Jest tests added for caching/TTL, scheduler cadence, and WS `priceError` emission.
- **WebSocket Debug Window (Dev-only)**
  - Floating Tailwind panel showing inbound/outbound WS events
  - Copy-all and clear actions for quick debugging
  - Enabled automatically when `NEXT_PUBLIC_APP_ENV!=production`
  - Files: `frontend/src/contexts/DebugLogContext.tsx`, `frontend/src/components/DebugWindow.tsx`, `frontend/src/components/AppProviders.tsx`
- **Homepage Visual Refresh**
  - Richer multi-layer gradients and overlays for depth
  - Proper banner image usage with controlled opacity and blend overlay
  - Subtle decorative gradient orbs in background
  - Enhanced glass cards and accent glows
  - Layout structure preserved (no markup restructuring)
- **Wallet identity + guest lifecycle (frontend)**
  - The app now prefers the connected wallet's cardinal address as the user identifier when creating pledges.
  - `guestId` is used only as a fallback when no wallet address is available.
  - On wallet disconnect, `guestId` is cleared automatically so the next connection/pledge session creates a fresh guest.
  - Testing disconnect (Header's Test mode) also clears `guestId`.
- **Pledge verification**
  - Verification is handled by the backend scheduler only; there is no frontend verify/attach call.
  - Frontend verify timers have been removed from `PledgeForm.tsx` and `PledgeInterface.tsx`.
  - After payment, the pledge is created with `txid` and later marked verified when confirmations are detected.
- **Centralized TypeScript Types**: Implemented a centralized type system
  - All shared types live in `shared/types/` and are consumed via `@shared/types`
  - Added shared UI types for `AuctionProgress` and `TimeRemaining` used by components
  - Improved type consistency across controllers, services, and frontend components
  - Better TypeScript error detection and prevention
  - Easier maintenance and updates to shared interfaces

- **Redis Pledge Queue**: Implemented first-come-first-served pledge processing
  - Pledges are processed in order of submission using Redis sorted sets
  - Real-time queue position updates via WebSocket events
  - Refund flag for pledges exceeding auction ceiling
  - Frontend queue display showing pledge status and position

- **CI/CD Workflows Updated**
  - Backend and Frontend GitHub Actions now build with repository root context so Docker can access `shared/` during builds.
  - Workflows trigger on changes under `shared/**` as well as their respective app folders.
  - Tabbed interface now includes three tabs: Make a Pledge, Pledge Queue, and Your Pledges
  - The last-selected tab persists across reloads via `localStorage` key `pledgeActiveTab`.
  - Views are now split: `PledgeQueue` shows the live queue; `YourPledges` lists the connected user's pledges.

- **Bitcoin Price Service**: Added real-time Bitcoin price fetching with 30-minute cache
  - Fetches BTC price from multiple sources (CoinGecko, Binance, CoinCap)
  - Uses median price to ensure accuracy and resilience
  - 30-minute cache to reduce API calls and ensure stability
  - Automatic price refresh every 15 minutes

- **Auction Time Limit**: Implemented 72-hour auction duration enforcement
  - Automatic auction completion after 72 hours
  - Real-time countdown timer showing remaining time
  - Scheduled background task to check for expired auctions
  - Auction ends either when ceiling is reached or time expires

- **New Auction Model**: Implemented First Come, First Served (FCFS) auction system
  - Replaced Dutch auction with FCFS model using ceiling market cap
  - Added refund mechanism for pledges exceeding ceiling
  - Real-time tracking of auction progress toward ceiling
  - Automatic auction completion when ceiling is reached

- **New Homepage**: Implemented modern auction interface with real-time updates
  - WebSocket-based auction data with real-time pledge updates
  - Interactive pledge interface with token estimation
  - Animated auction progress bar and countdown timer
  - Recent activity feed showing latest pledges

- **Enhanced UI**: Added gradient effects, animations, and improved dark mode styling
  - Gradient text for main heading with glow animation
  - Card hover effects with orange glow
  - Glass card effect for components
  - Subtle background gradient for depth

- **Tailwind Theme Update**
  - Added CSS-variable driven color scheme with `darkMode: 'class'`
  - Added Inter font alias `font-inter`
  - Included `tailwindcss-animate` and `@tailwindcss/typography` plugins

- **Tailwind Downgrade to v3 + Radix UI Integration**
  - Downgraded frontend Tailwind to v3 (`tailwindcss@^3.4.x`) with PostCSS 8
  - Switched PostCSS plugin to `tailwindcss` (removed `@tailwindcss/postcss`)
  - Restored Tailwind v3 `content` array in `frontend/tailwind.config.ts`
  - Installed Radix UI primitives for accessible components

- **Bitcoin Wallet Adapter Docs**
  - Added `frontend/docs/bitcoin-wallet-adapter.md` summarizing provider setup, connect component, and hooks

A Next.js application integrated with an Express server implementing WebSocket communication for a First Come, First Served (FCFS) auction system. This application implements the core mechanics of the Adderrels auction pledge system, including wallet connection, pledging, real-time auction status updates, and token allocation calculations.

## Features

- Real-time auction updates via WebSocket
- Simple guest authentication system
- Wallet connection functionality
- Pledge creation and verification
- Automatic token allocation calculation
- Responsive UI with Tailwind CSS
- Real-time Bitcoin price fetching from multiple sources
- 72-hour auction time limit enforcement
- Automatic refund mechanism for excess pledges
- Redis-based pledge queue with real-time position updates
- Pledge queue display showing status and position
- Tabbed interface to switch between pledge form and queue

## Project Structure

```
adderrels-auction/
├── backend/           # Express server with WebSocket
│   ├── src/
│   │   ├── config/    # Environment configuration
│   │   ├── controllers/ # API controllers
│   │   ├── middleware/ # Auth middleware
│   │   ├── models/    # Data models
│   │   ├── routes/    # API routes
│   │   ├── services/  # Services including Bitcoin price fetching
│   │   ├── ...        # (All TypeScript types are consolidated under shared/types)
│   │   ├── websocket/ # WebSocket handlers
│   │   └── server.ts  # Main server entry point
│   └── ...
└── frontend/         # Next.js frontend
    ├── src/
    │   ├── app/      # Next.js app router
    │   ├── components/ # React components
    │   └── contexts/  # React contexts
    └── ...
├── shared/
│   └── types/        # Shared TypeScript types used by both frontend and backend
```

## Prerequisites

- Node.js (v16 or higher)
- Yarn package manager

## Setup Instructions

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Update the `.env` file with your configuration:
  ```
  PORT=5000
  JWT_SECRET=your_secret_key
  CLIENT_URL=http://localhost:3000
  BTC_DEPOSIT_ADDRESS=bc1qxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  ```

5. Start the development server:
   ```bash
   yarn dev
   ```

6. Run backend tests (Jest + ts-jest):
   ```bash
   yarn test
   # or with coverage
   yarn test:coverage
   ```

### DB Migration (after schema changes)

From `backend/` run:

```bash
yarn prisma:generate
yarn prisma:migrate
yarn seed
```

Notes:
- This creates/applies Prisma migrations to your Postgres and reseeds data.
- Update backend code where `Pledge.btcAmount`, `sender`, `recipient` were used to `satAmount`, `cardinal_address`, `ordinal_address` respectively.
- Update `minPledge` and `maxPledge` fields to use satoshi values (e.g., `100000` for 0.001 BTC).
- When computing totals, convert sats to BTC using integer math and format at the edges.

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Copy the example env file to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```

4. Adjust values in `.env.local` as needed (defaults shown in the example):
   ```
  NEXT_PUBLIC_API_URL=http://localhost:5000
  NEXT_PUBLIC_WS_URL=ws://localhost:5000
  NEXT_PUBLIC_APP_ENV=development
  NEXT_PUBLIC_BTC_NETWORK=mainnet
  NEXT_PUBLIC_TESTING=false
  ```

5. Centralized env config (frontend):
  - File: `frontend/src/config/env.ts`
  - Import via `import { env } from '@/config/env'` or relative from components.
  - Exposes: `apiUrl`, `wsUrl`, `appEnv`, `testing`, `btcNetwork`.

5. Start the development server:
   ```bash
   yarn dev
   ```

## WebSocket Debug Window

To enable the WebSocket Debug Window, set `NEXT_PUBLIC_APP_ENV` to `development` in your `.env.local` file. This will automatically enable the debug window. The debug window will appear as a floating panel on the right side of the screen, showing inbound and outbound WebSocket events. You can copy all logs or clear them for quick debugging.

## Frontend Testing Mode

- Enable by setting `NEXT_PUBLIC_TESTING=true` in `frontend/.env.local` (see `frontend/.env.local.example`).
- When enabled:
  - Header shows a "Test Connect" button and hides the normal `ConnectMultiButton`.
  - After connecting, a "Disconnect" button appears to clear testing state immediately (removes `localStorage` keys and broadcasts `test-wallet-disconnected`).
  - Clicking "Test Connect" stores a random test wallet in `localStorage` under keys:
    - `testWallet` (JSON wallet object), `testWalletConnected` = `"true"`.
  - Home page (`frontend/src/app/page.tsx`) treats this as connected and passes it down to pledge UI.
  - Pledge UI (`frontend/src/components/PledgeInterface.tsx`):
    - Shows a demo balance equal to `$100,000` converted to BTC at current BTC/USD price.
    - Validates input against this demo balance (you cannot pledge more than ~$10k in BTC).
    - After successful pledge creation, auto-verifies the pledge by posting a random txid after a 60–120s delay.
    - It prefers a txid from `/public/txids.json` if available; otherwise generates a random 64-hex string.
- Disable by setting `NEXT_PUBLIC_TESTING=false` or removing the var.
- Clear testing state by removing `localStorage` keys `testWallet` and `testWalletConnected`.

## Auction Mechanics

The Adderrels auction follows a First Come, First Served (FCFS) model with these rules:

- Total tokens for sale: 100 million (10% of total supply)
- Ceiling market cap: $15 million
- Default auction duration: 72 hours
- Dev reseed mode creates a separate 24-hour demo auction targeting ~$1,000 total in USD terms (see below).
- Minimum/Maximum pledge are stored as sats and may be dynamically set by reseed.
 - Production seed start time: fixed to 29 August at 13:00 UTC (current year). Test/dev reseeds start immediately.

Auction scenarios:
- Scenario 1: Ceiling market cap reached before 72 hours, auction ends immediately
- Scenario 2: Ceiling market cap not reached, auction ends after 72 hours, final market cap determined by total BTC raised

Refund mechanism:
- If a pledge would cause the total raised to exceed the ceiling market cap, the excess amount is refunded
- If a pledge comes in after the ceiling is reached, the entire pledge is refunded

## API Endpoints

### Authentication
- `POST /api/auth/guest-id` - Get a guest ID (used for identifying guest users; no bearer token required)

### Auction
- `GET /api/auction/status` - Get auction status (public)
- `POST /api/auction/reset` - Dev-only auction reset: deletes pledges for the active auction and restarts it with a fresh 72h window; does not touch users
- `POST /api/auction/reseed[?mode=test|prod]` - Dev-only full DB wipe + reseed.
  - `mode=test` (default): truncates `User`, `Auction`, `Pledge` and seeds admin, sample users, one active 24h auction (demo bounds) and 3–6 pledges.
  - `mode=prod`: truncates tables and seeds admin plus a production-style auction only (no sample users/pledges) with:
    - totalTokens: 100,000,000
    - ceilingMarketCap: $15,000,000
    - startTime: 29 August 13:00 UTC (current year)
    - endTime: +72h
  - Example:
    ```bash
    curl -X POST http://localhost:5000/api/auction/reseed?mode=prod
    ```

### Status
- `GET /api/status` - Backend runtime status used by the frontend env guard.
  - Response: `{ network: 'mainnet' | 'testnet', testing: boolean, nodeEnv: string }`

## WebSocket Messages

### Client to Server
- `auth` - Authenticate with guest ID

### Server to Client
- `auction_status` - Periodic auction status updates (also requested immediately after pledge events on the client)
- `pledge_created` - New pledge created
- `pledge_verified` - Pledge verification status
- `pledge:processed` - Pledge has been processed from the queue
- `pledge:queue:position` - Update on pledge position in queue
- `queue:updated` - General queue update notification

## Tech Stack

### Frontend
- Next.js + TypeScript + TailwindCSS
- Realtime via Socket.IO client
- Uses `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL`
- Env guard: compares `NEXT_PUBLIC_BTC_NETWORK` and `NEXT_PUBLIC_TESTING` with backend `/api/status`.

### Header Wallet Balance
- The header (`frontend/src/components/Header.tsx`) shows the connected wallet's confirmed BTC balance and an approximate USD value.
- Balance badge is hidden when no wallet is connected (no `confirmed` balance available).
- Implemented using `useWalletBalance` from `bitcoin-wallet-adapter` with null-safe checks and improved formatting.
- `ConnectMultiButton` now:
  - Uses network from `env.btcNetwork` (`NEXT_PUBLIC_BTC_NETWORK`).
  - Limits `supportedWallets` to `Unisat`, `Xverse`, `Leather` (Phantom excluded).
  - Optionally receives current balance for display.

### Global Network Tag & Env Guard
- Header shows a small tag with the current frontend network and testing flag (e.g. `mainnet TEST`).
- A global guard component fetches backend status from `/api/status` and blocks the UI with a fullscreen warning if:
  - Frontend `NEXT_PUBLIC_BTC_NETWORK` != backend `BTC_NETWORK`, or
  - Frontend `NEXT_PUBLIC_TESTING` != backend `TESTING`.
- Update envs to resolve and refresh the app.

### Reset DB Button (Dev-only)
- `ResetDbButton.tsx` adds an AbortController with a 15s timeout for `/api/auction/reseed` to avoid hanging requests and shows a friendly timeout error.
- It now supports selecting reseed mode `test` or `prod` and calls `/api/auction/reseed?mode=...` accordingly.
- Prod mode seeds a production-style auction starting at 29 Aug 13:00 UTC (72h), no test users/pledges.

Example internals:
```javascript
import { ConnectMultiButton, useWalletBalance } from 'bitcoin-wallet-adapter';
const { balance, btcPrice } = useWalletBalance();
const confirmedBtc = balance?.confirmed ?? 0;
```

### Global Testing Banner
- A global testing banner is shown at the top of the homepage when `NEXT_PUBLIC_TESTING=true`.
- Component: `frontend/src/components/TestingBanner.tsx`.
- Rendered in `frontend/src/app/page.tsx` just below the background, above the main content.
- Purpose: indicate sandbox mode; balances/data may be simulated.

Enable it by adding to `frontend/.env.local` and rebuilding the frontend:
```
NEXT_PUBLIC_TESTING=true
```

### Recent Activity / Pledge Queue UI

- Random avatars per user via DiceBear seeded by their address/userId
- Usernames are truncated addresses (e.g. `bc1qxyz...9a2f`)
- Shows estimated ADDERRELS allocation for each pledge based on current totals
- Realtime updates on `pledge_created`, `pledge:processed`, `pledge:queue:update`
- Recent Activity merges live queue entries with activity feed and displays a Tx Status badge (In Queue / Processed / Confirmed). Refund states are not shown in the UI.
 - Allocation info: an info icon in the Allocation column header toggles the formula panel. Formula used: `tokens = (totalTokens / totalPledgedBTC) × pledgeBTC`, where `totalPledgedBTC` includes processed + pending pledges. The table lists only pending pledges.
 - Highlighting: pending pledges by the connected wallet are highlighted in the table for quick visibility.

### Backend
- Node + TypeScript + Express
- Prisma + Postgres
- Redis (queue + Socket.IO adapter)
 - Jest + ts-jest for automated tests (Bitcoin Price Service, scheduler, WS emissions)
- Exposes `/api/status` and reads:
  - `BTC_NETWORK` (default: `mainnet`)
  - `TESTING` (default: `false`)

## Testing

- Backend tests live under `backend/src/tests/`:
  - `bitcoinPriceService.test.ts`: live HTTP; validates median calc, short/long Redis caches, and failure handling.
  - `scheduledTasks.test.ts`: starts the real scheduler and waits for Redis to populate; stops interval after each test.
  - `txConfirmationScheduler.e2e.test.ts`: uses mempool.space live endpoints to assert that the tx-confirmation scheduler marks pledges correctly:
    - Picks a confirmed txid from `frontend/public/txids.json` (verifies it is still confirmed).
    - Fetches a recent pending txid from `GET https://mempool.space/api/mempool/recent`.
    - Seeds pledges for both and runs `txConfirmationService.checkUnverifiedPledges()`; expects confirmed/pending statuses respectively.
    - Note: this test performs real network calls and may be rate-limited; prefer running with local Docker services up (Postgres/Redis) to reduce variability.
  - `socketHandler.price.test.ts`: isolates and mocks BTC price; asserts `priceError` semantics and computed fields.
  - `socketHandler.payload.test.ts`: validates completeness of `auction_status` payload and pledge user addresses across scenarios (price ok/error, ceiling reached).
  - `statusRoutes.test.ts`: validates `GET /api/status` returns `{ network, testing, nodeEnv, btcUsd }` with `btcUsd` as number|null.
- Tests default to Testcontainers (ephemeral Postgres/Redis). Optional local mode is below.
- Ensure Docker is running; then from `backend/` run `yarn test`.

### Hybrid local services for backend tests (optional)

- Prefer Testcontainers by default. For faster local runs you can reuse persistent local Docker services.
- Start local Postgres and Redis from `backend/`:
  ```bash
  yarn services:up
  ```
- pgAdmin is available at http://localhost:5050 (email: `admin@local.test`, password: `admin`).
  - Add a server: Host `acorn_test_postgres` or `localhost`, Port `5432`, User `test`, Password `test`, DB `testdb`.
  - Useful for inspecting schemas and running queries during tests.
- Set env for Jest (e.g., in your shell or `.env.test.local` loaded by your environment):
  ```bash
  # Postgres (matches docker-compose.test.yml)
  DATABASE_URL=postgresql://test:test@localhost:5432/testdb?schema=public
  # Redis (prefer REDIS_URL; falls back to host/port)
  REDIS_URL=redis://localhost:6379
  ```
- Run tests using local services:
  ```bash
  yarn test:local
  ```
  - To run just the tx confirmation scheduler test:
    ```bash
    yarn test:local -t "Tx Confirmation Scheduler"
    ```
- Notes:
  - In local mode (`USE_LOCAL_SERVICES=true`) global setup skips Testcontainers and Prisma steps. Run DB setup yourself when needed:
    ```bash
    yarn prisma:generate && yarn prisma:migrate && yarn seed
    ```
  - Stop services when done:
    ```bash
    yarn services:down
    ```

#### Helpful CLIs

- From `backend/` you can open containerized CLIs:
  ```bash
  yarn db:psql     # psql into Postgres (db=testdb, user=test)
  yarn redis:cli   # open redis-cli against local Redis
  ```

### Testcontainers details (backend)

- Global setup `backend/src/tests/setup/testcontainers.setup.ts`:
  - Starts Postgres (`postgres:16`) and Redis (`redis:7-alpine`) containers
  - Sets `DATABASE_URL` and `REDIS_*` env vars for the Jest process
  - Runs `prisma generate` and `prisma migrate deploy` in the backend CWD
  - Emits detailed logs; enable extra logs via `DEBUG=testcontainers*`
- Per-test setup `backend/src/tests/setup/jest.setup.ts` clears Redis keys and truncates core tables for isolation.
- Backend test isolation tips (important):
  - Global `beforeEach` truncates `User`, `Auction`, and `Pledge` tables and clears Redis between tests.
  - Therefore, create any required test data inside each suite's `beforeEach`, not in `beforeAll`.
  - Example updated tests: `backend/src/tests/maxPledge.routes.test.ts`, `backend/src/tests/auctionStats.routes.test.ts` create auctions in `beforeEach` and sanity-check via `GET /api/auction/:id`.
  - Stub external dependencies (e.g., BTC price) in `beforeAll` and restore in `afterAll` to avoid live network during API tests.
  - Use the shared test factory `backend/src/tests/utils/testFactories.ts#createActiveAuction()` to seed auctions with sensible defaults; pass overrides as needed per test.

#### Redis caching gotchas (tests)

- Controllers and services cache under keys like `btc:price:*` and `auction:*`.
- Global Jest setup already flushes Redis between tests; if a test asserts TTL or cache-warm behavior, explicitly clear the relevant keys in that test's `beforeEach` (see `bitcoinPriceService.test.ts`, `scheduledTasks.test.ts`).
- When mocking BTC price with `jest.isolateModules`, ensure the mock is applied before importing `websocket/socketHandler` so the isolated module registry sees the stubbed price service (see `socketHandler.*.test.ts`).

### Scheduler interval safety

- `startBitcoinPriceRefresh()` creates a 15m interval and triggers an immediate refresh if cache is cold/warm-threshold violated.
- Interval uses `.unref()` and can be stopped via `stopBitcoinPriceRefresh()` (used in tests to prevent leaks).

### Troubleshooting tests

- If Jest hangs or exits with leak warnings, try:
  - `yarn test --detectOpenHandles`
  - Ensure all intervals are cleared (tests should call `stopBitcoinPriceRefresh()` in `afterEach`)
  - Confirm Docker is running and images can be pulled; verify network access for live price APIs

### Real DB/Redis (Testcontainers)

- Prereq: Docker daemon running and network access to pull images `postgres:16` and `redis:7-alpine`.
- Jest global setup (`backend/src/tests/setup/testcontainers.setup.ts`) will:
  - Start ephemeral Postgres and Redis containers
  - Set `DATABASE_URL`, `REDIS_*` env vars
  - Run `prisma generate` and `prisma migrate deploy`
  - Tests clean Redis keys and truncate tables between cases
 - Teardown stops containers automatically.

### Frontend Jest + React Testing Library

- Location: `frontend/src/__tests__/`
- Runner: Jest (`jsdom` env) with RTL and `whatwg-fetch` polyfill.
- Config: `frontend/jest.config.ts` (uses `ts-jest` transform with `isolatedModules`), setup at `frontend/jest.setup.ts`.
- Path aliases supported: `@/` → `frontend/src/`, `@shared/` → `shared/`.

Run:
```bash
cd frontend
yarn test
```

Key UI test:
- `frontend/src/__tests__/pledgeFlow.ui.test.tsx`
  - Verifies pledge lifecycle across `PledgeQueue`, `RecentActivity`, and `AuctionStatus` reacting to mocked fetches and WebSocket events.
  - Notes: advances fake timers (300ms debounce), scopes assertions with `within()` to the queue, and uses a mock socket exposed on `globalThis`.

#### Additional UI tests (coverage expansion)
- `frontend/src/__tests__/pledgeQueue.states.test.tsx`
  - Loading/empty/error states, fetch error messaging, basic guard when `auctionId` is missing.
- `frontend/src/__tests__/recentActivity.rules.test.tsx`
  - Limits to 10 newest items, sort order, refunded/confirmed badges with scoped queries.
- `frontend/src/__tests__/auctionStatus.updates.test.tsx`
  - Connection/loading banners, active/ended banners, progress bar values and formatted totals.
- `frontend/src/__tests__/pledgeInterface.validation.test.tsx`
  - Wallet gating, min/max amount validation, balance checks, and estimated tokens visibility rules.
- `frontend/src/__tests__/environmentGuard.banner.test.tsx`
  - Backend fetch error overlay and environment mismatch overlay (scoped assertions within the banner).
- `frontend/src/__tests__/pledgeQueue.websocket.reconnect.test.tsx`
  - Simulates WebSocket-driven queue update/reconnect and asserts refetch.
- `frontend/src/__tests__/recentActivity.transitions.test.tsx`
  - Mixed refunded/confirmed items and transition from confirmed → refunded.

Notes:
- Tests rely on `NEXT_PUBLIC_API_URL` defaulting to `http://localhost:5000` and may log a warning; harmless.
- Wallet and WebSocket hooks are mocked; tests are deterministic and isolated.
 - Jest setup suppresses only the expected env warning from `PledgeQueue.tsx`; see `frontend/jest.setup.ts`.

Env notes:
- Tests do not require `NEXT_PUBLIC_API_URL`, but warnings may appear; harmless.
- Wallet adapters are mocked; no browser wallet needed.

## Notes

- Bitcoin price is fetched from multiple sources to ensure accuracy and resilience
- The auction automatically ends after 72 hours or when ceiling market cap is reached
- Scheduled tasks run in the background to check auction time limits and refresh Bitcoin price
- Redis is used for caching to improve performance and reduce external API calls
- In a production environment, consider adding more error handling and fallback mechanisms

## CI/CD: Container Images (GHCR)

- Workflows:
  - `.github/workflows/build-push-frontend.yml` builds `frontend/` and pushes:
    - `ghcr.io/<owner>/addrellauction-frontend:latest`
    - `ghcr.io/<owner>/addrellauction-frontend:<short-sha>`
    - `ghcr.io/<owner>/addrellauction-frontend:<branch>`
    - `ghcr.io/<owner>/addrellauction-frontend:<major>.<minor>` and `<major>` on `vX.Y.Z` tags
  - `.github/workflows/build-push-backend.yml` builds `backend/` and pushes:
    - `ghcr.io/<owner>/addrellauction-backend:latest`
    - `ghcr.io/<owner>/addrellauction-backend:<short-sha>`
    - `ghcr.io/<owner>/addrellauction-backend:<branch>`
    - `ghcr.io/<owner>/addrellauction-backend:<major>.<minor>` and `<major>` on `vX.Y.Z` tags
- Images are multi-arch (amd64/arm64). Built via Yarn. Uses Docker Buildx cache.
- Frontend Dockerfile isolates Yarn cache per-arch and locks cache mounts to avoid cross-arch cache corruption when resolving platform-specific Next.js SWC binaries during multi-arch builds.
- Frontend runtime now uses Next.js standalone output. The image runs `node server.js` instead of `yarn start` to avoid requiring the `next` CLI in the final image. See `frontend/Dockerfile` and `frontend/next.config.ts` (with `output: 'standalone'`). This fixes CI/CD errors like `/bin/sh: next: not found` during container runtime.

#### Frontend CI build optimizations
- Debian slim base (`node:20-bookworm-slim`) replaces Alpine to speed up installs and avoid native rebuild slowdowns on arm64.
- Next.js compiler cache mounted in Docker build: `--mount=type=cache,target=.next/cache` to cut rebuild times.
- Telemetry disabled in build stage: `NEXT_TELEMETRY_DISABLED=1`.
- Optional: skip lint/typecheck inside Docker build for faster images (set in `frontend/Dockerfile`):
  - `NEXT_DISABLE_ESLINT=1`
  - `NEXT_DISABLE_TYPECHECK=1`
  Run `yarn lint` and `yarn tsc --noEmit` as separate CI steps if needed.
- Workflow builds amd64 by default; multi-arch (amd64, arm64) only on `v*.*.*` tags to speed up regular pushes. See `.github/workflows/build-push-frontend.yml`.
- Pull:
  ```bash
  docker pull ghcr.io/<owner>/addrellauction-frontend:latest
  docker pull ghcr.io/<owner>/addrellauction-backend:latest
  ```
- Runtime envs:
  - Frontend: provide `NEXT_PUBLIC_*` at run.
  - Backend: `PORT` (default 5000), DB/Redis/JWT envs (see `.env.example`), and `BTC_DEPOSIT_ADDRESS` for the single global deposit address.

### Backend runtime requirements and CI/CD fixes
- **Prisma engines (OpenSSL)**: The backend Docker image installs `openssl` in both build and runtime stages, and Prisma `binaryTargets` include `native`, `debian-openssl-1.1.x`, and `debian-openssl-3.0.x` in `backend/prisma/schema.prisma`. This prevents query engine mismatches on Debian-based images.
- **Redis connection**: Set `REDIS_URL` (e.g., `redis://redis:6379`) in your deployment. The app prefers `REDIS_URL`; only falls back to host/port. Avoid `localhost` in containers.
- **Database**: Provide `DATABASE_URL` (Postgres). Migrations run via CI scripts or manually using `yarn prisma:migrate`.
- **Ports/Health**: Backend listens on `PORT` (default 5000) and has a basic TCP healthcheck.
 - **Tx Confirmation Service env**:
   - `TESTING=true|false` to enable/disable random confirmation results (default false).
   - `MEMPOOL_MAINNET_BASE` (default `https://mempool.space/api`).
   - `MEMPOOL_TESTNET_BASE` (default `https://mempool.space/testnet/api`).
   - Runs automatically at startup; no additional setup required.

### Deployment notes (quick)
- Frontend: expose 3000 behind CDN/ALB; put CloudFront in front for cache/static.
- Backend: expose 5000 behind ALB with WebSocket + sticky sessions; health checks + autoscale.
- Run across multiple AZs for resilience.

## Test Data: wallets.json

- Location: `frontend/public/wallets.json` (served at `/wallets.json`)
- Purpose: Testing-only dataset of publicly known Bitcoin addresses to simulate users in UI flows.
- Schema: Mirrors backend `User` fields for compatibility: `id`, `cardinal_address`, `ordinal_address`, `cardinal_pubkey`, `ordinal_pubkey`, `wallet`, `network`, `connected`, `createdAt`, plus `label`, `sourceUrl`.
- Usage (frontend): Fetch and handle nulls safely.
  - Example: `const res = await fetch('/wallets.json'); const data = await res.json(); const wallets = data?.wallets ?? [];`
- Sources: Use public donation addresses and exchange cold wallets cited by reputable sources only. Do not include private/personal addresses.
- Note: Do not use in production.

### Build/update the list
- Configure source URLs in `frontend/scripts/sources/urls.json` (mainnetUrls/testnetUrls).
- Build file: from `frontend/` run `yarn wallets:build`.
- The script fetches pages, extracts likely BTC addresses (bech32/base58), classifies by prefix, dedupes, and writes exactly 100 mainnet + 100 testnet when available.

#### BSON ingestion (MongoDB dumps)
- The builder can ingest `.bson` files using `bsondump`.
- Focuses on `sales.bson` for wallet extraction (txes.bson is intentionally ignored by default to avoid heavy parsing). Override with `--bsonFiles`, but `txes.bson` will still be excluded.
- Example:
  ```bash
  yarn wallets:build \
    --bsonDir="/path/to/mongodb_backup/ordinalnovus" \
    --bsonFiles=sales.bson
  ```
- Requirements: `bsondump` (MongoDB Database Tools) available in PATH.

#### TXIDs output (from sales.bson)
- During the build, the script also extracts `txid` values from `sales.bson` and writes them to `frontend/public/txids.json`.
- The extractor collects any 64-hex string, or values under keys matching `/txid|tx_id|transaction_id/i`.
- Example fetch in frontend:
  ```ts
  const res = await fetch('/txids.json');
  const data = await res.json();
  const txids: string[] = data?.txids ?? [];
  ```

## License

MIT
