 - **Frontend UI Improvements**:
   - Set app favicon to `/public/acorn.png` via Next.js metadata in `frontend/src/app/layout.tsx`
   - Configured `WalletProvider` to accept and pass `customAuthOptions` to `bitcoin-wallet-adapter` with ACORN icon
   - Default network is `mainnet`; override via `customAuthOptions` if needed
# ACORN Auction Platform

## Recent Updates
- **Backend Tests: Real Services via Testcontainers (Live HTTP)**
  - Jest runs against real Postgres and Redis containers (ephemeral) using Testcontainers
  - Bitcoin price service tests perform real HTTP calls (no mocks) and assert Redis cache TTLs
  - Scheduled tasks use a leak-safe interval with `.unref()` and expose `stopBitcoinPriceRefresh()` for tests
  - Detailed logs added to global setup; Prisma generate/migrate executed automatically
- **Animated Auction Progress Bar (Live-reactive)**
  - Lively gradient fill with shimmer and subtle bump on pledge-driven increases
  - Reacts in real time to `auction_status` WebSocket updates
  - Files: `frontend/src/components/auction-progress.tsx`, `frontend/src/app/globals.css`
  - Accessible with `role="progressbar"` and ARIA values
- **Raised So Far Highlight**
  - New highlighted stat card in `AuctionStats` showing total BTC raised with a percentage-of-ceiling badge
  - Prop: `totalRaisedBTC` added to `AuctionStats` and wired from `page.tsx`
  - Files: `frontend/src/components/auction-stats.tsx`, `frontend/src/app/page.tsx`
- **Footer UI Polish**
  - Glass-card footer with rounded top, blur, and clearer border for readability
  - File: `frontend/src/app/page.tsx`
- **WS Payload: Auction ID**
  - `auction_status` now includes `id` (active auction ID)
  - Frontend reads `auctionState.id` to route API calls
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
- **Centralized TypeScript Types**: Implemented a centralized type system
  - All shared types moved to a central `/src/types` directory
  - Improved type consistency across controllers and services
  - Better TypeScript error detection and prevention
  - Easier maintenance and updates to shared interfaces

- **Redis Pledge Queue**: Implemented first-come-first-served pledge processing
  - Pledges are processed in order of submission using Redis sorted sets
  - Real-time queue position updates via WebSocket events
  - Refund flag for pledges exceeding auction ceiling
  - Frontend queue display showing pledge status and position
  - Tabbed interface to switch between pledge form and queue view

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

A Next.js application integrated with an Express server implementing WebSocket communication for a First Come, First Served (FCFS) auction system. This application implements the core mechanics of the ACORN auction pledge system, including wallet connection, pledging, real-time auction status updates, and token allocation calculations.

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
acornAuction/
├── backend/           # Express server with WebSocket
│   ├── src/
│   │   ├── config/    # Environment configuration
│   │   ├── controllers/ # API controllers
│   │   ├── middleware/ # Auth middleware
│   │   ├── models/    # Data models
│   │   ├── routes/    # API routes
│   │   ├── services/  # Services including Bitcoin price fetching
│   │   ├── types/     # Centralized TypeScript type definitions
│   │   ├── websocket/ # WebSocket handlers
│   │   └── server.ts  # Main server entry point
│   └── ...
└── frontend/         # Next.js frontend
    ├── src/
    │   ├── app/      # Next.js app router
    │   ├── components/ # React components
    │   └── contexts/  # React contexts
    └── ...
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

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Create a `.env.local` file:
   ```bash
   touch .env.local
   ```

4. Add the following environment variables to `.env.local`:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:5000
   NEXT_PUBLIC_WS_URL=ws://localhost:5000
   NEXT_PUBLIC_APP_ENV=development
   ```

5. Start the development server:
   ```bash
   yarn dev
   ```

## WebSocket Debug Window

To enable the WebSocket Debug Window, set `NEXT_PUBLIC_APP_ENV` to `development` in your `.env.local` file. This will automatically enable the debug window. The debug window will appear as a floating panel on the right side of the screen, showing inbound and outbound WebSocket events. You can copy all logs or clear them for quick debugging.

## Auction Mechanics

The ACORN auction follows a First Come, First Served (FCFS) model with these rules:

- Total tokens for sale: 100 million (10% of total supply)
- Ceiling market cap: $15 million
- Auction duration: 72 hours
- Minimum pledge: 0.001 BTC
- Maximum pledge: 0.5 BTC

Auction scenarios:
- Scenario 1: Ceiling market cap reached before 72 hours, auction ends immediately
- Scenario 2: Ceiling market cap not reached, auction ends after 72 hours, final market cap determined by total BTC raised

Refund mechanism:
- If a pledge would cause the total raised to exceed the ceiling market cap, the excess amount is refunded
- If a pledge comes in after the ceiling is reached, the entire pledge is refunded

## API Endpoints

### Authentication
- `POST /api/auth/guest-token` - Get a guest JWT token

### Auction
- `GET /api/auction/status` - Get auction status (public)
- `POST /api/auction/reset` - Dev-only full reset: truncates `User`, `Auction`, `Pledge`, `RefundedPledge`, reseeds admin + sample users + a fresh 72h auction, purges Redis `auction:*` caches, and broadcasts the new state

## WebSocket Messages

### Client to Server
- `auth` - Authenticate with guest token

### Server to Client
- `auction_status` - Periodic auction status updates
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

### Recent Activity / Pledge Queue UI

- Random avatars per user via DiceBear seeded by their address/userId
- Usernames are truncated addresses (e.g. `bc1qxyz...9a2f`)
- Shows estimated ACORN allocation for each pledge based on current totals
- Realtime updates on `pledge_created`, `pledge:processed`, `pledge:queue:update`
- Recent Activity merges live queue entries with activity feed and displays a Tx Status badge (In Queue / Processed / Refunded / Confirmed)

### Backend
- Node + TypeScript + Express
- Prisma + Postgres
- Redis (queue + Socket.IO adapter)
 - Jest + ts-jest for automated tests (Bitcoin Price Service, scheduler, WS emissions)

## Testing

- Backend tests live under `backend/src/tests/`:
  - `bitcoinPriceService.test.ts`: uses live HTTP; validates median calc, short/long Redis caches, and failure handling.
  - `scheduledTasks.test.ts`: starts the real scheduler and waits for Redis to populate; stops interval after each test.
  - `socketHandler.price.test.ts`: uses live price service; asserts `priceError` semantics and computed fields.
- Tests run against real Postgres and Redis using Testcontainers and require internet for live price APIs.
- Ensure Docker is running; then from `backend/` run `yarn test`.

### Testcontainers details (backend)

- Global setup `backend/src/tests/setup/testcontainers.setup.ts`:
  - Starts Postgres (`postgres:16`) and Redis (`redis:7-alpine`) containers
  - Sets `DATABASE_URL` and `REDIS_*` env vars for the Jest process
  - Runs `prisma generate` and `prisma migrate deploy` in the backend CWD
  - Emits detailed logs; enable extra logs via `DEBUG=testcontainers*`
- Per-test setup `backend/src/tests/setup/jest.setup.ts` clears Redis keys and truncates core tables for isolation.

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

## Notes

- Bitcoin price is fetched from multiple sources to ensure accuracy and resilience
- The auction automatically ends after 72 hours or when ceiling market cap is reached
- Scheduled tasks run in the background to check auction time limits and refresh Bitcoin price
- Redis is used for caching to improve performance and reduce external API calls
- In a production environment, consider adding more error handling and fallback mechanisms

## CI/CD: Container Images (GHCR)

- Workflows:
  - `.github/workflows/build-push-frontend.yml` builds `frontend/` and pushes:
    - `ghcr.io/<owner>/frontend:latest`, `<short-sha>`, `<semver>` on `vX.Y.Z` tags
  - `.github/workflows/build-push-backend.yml` builds `backend/` and pushes:
    - `ghcr.io/<owner>/backend:latest`, `<short-sha>`, `<semver>` on `vX.Y.Z` tags
- Images are multi-arch (amd64/arm64). Built via Yarn. Uses Docker Buildx cache.
- Frontend Dockerfile isolates Yarn cache per-arch and locks cache mounts to avoid cross-arch cache corruption when resolving platform-specific Next.js SWC binaries during multi-arch builds.
- Pull:
  ```bash
  docker pull ghcr.io/<owner>/frontend:latest
  docker pull ghcr.io/<owner>/backend:latest
  ```
- Runtime envs:
  - Frontend: provide `NEXT_PUBLIC_*` at run.
  - Backend: `PORT` (default 5000), DB/Redis/JWT envs (see `.env.example`).

### Deployment notes (quick)
- Frontend: expose 3000 behind CDN/ALB; put CloudFront in front for cache/static.
- Backend: expose 5000 behind ALB with WebSocket + sticky sessions; health checks + autoscale.
- Run across multiple AZs for resilience.

## License

MIT
