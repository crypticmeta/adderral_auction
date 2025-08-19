 - **Frontend UI Improvements**:
   - Set app favicon to `/public/acorn.png` via Next.js metadata in `frontend/src/app/layout.tsx`
   - Configured `WalletProvider` to accept and pass `customAuthOptions` to `bitcoin-wallet-adapter` with ACORN icon
   - Default network is `mainnet`; override via `customAuthOptions` if needed
# ACORN Auction Platform

## Recent Updates
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
   ```

5. Start the development server:
   ```bash
   yarn dev
   ```

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
- Next.js 15 with App Router
- TypeScript
- Tailwind CSS v4 (with @tailwindcss/postcss)
- Bitcoin Wallet Adapter (Unisat, Xverse, Leather)
- Socket.io Client
- Redux Toolkit

### Backend
- Express server with TypeScript
- Prisma ORM for database access
- Redis for caching auction data and Bitcoin price
- Socket.io for real-time updates
- Axios for external API requests
- Scheduled tasks for time-based operations

## Notes

- Bitcoin price is fetched from multiple sources to ensure accuracy and resilience
- The auction automatically ends after 72 hours or when ceiling market cap is reached
- Scheduled tasks run in the background to check auction time limits and refresh Bitcoin price
- Redis is used for caching to improve performance and reduce external API calls
- In a production environment, consider adding more error handling and fallback mechanisms

## License

MIT
