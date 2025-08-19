<!-- File: TEST_PLAN.md | Purpose: End-to-end test checklist for ACORN Auction Platform -->
# ACORN Auction Platform — Test Plan

Use this checklist to verify core flows, real-time behavior, UI consistency, and error handling across frontend and backend. All paths are relative to the repo root.

## WebSocket & Debug Window
- [x] When `NEXT_PUBLIC_APP_ENV=development`, Debug Window appears
- [x] Logs inbound/outbound/system/error events
- [x] Copy All and Clear actions work

## Auction Status & Countdown
- [ ] `auction_status` payload includes `id`, `totalTokens`, `ceilingMarketCap`, `currentMarketCap`, `refundedBTC`, `minPledge`, `maxPledge`, `startTime`, `endTime`, `serverTime`, `ceilingReached`
- [ ] Frontend reads `auctionState.id` for API routing
- [ ] Countdown synchronizes with `endTimeMs`/`serverTimeMs` and ticks smoothly
- [ ] Animated auction progress bar reacts to status updates

## Bitcoin Price Service
- [ ] BTC price fetched and cached; values refresh every ~15 minutes
- [ ] If price fetch fails, backend sets `priceError: true`
- [ ] Frontend disables pledge UI and shows a banner until recovery

## Pledge Flow (FCFS)
- [ ] Connect a wallet (or guest auth) succeeds
- [ ] Create pledge within limits succeeds
- [ ] Pledge triggers real-time updates (progress bar, totals)
- [ ] Excess pledges over ceiling are marked for refund
- [ ] After processing, refunded amounts are reflected

## Queue Limits & Validation
- [ ] `PledgeQueue` fetches min/max limits only via API `/api/pledges/max-pledge/:auctionId` (no WS fallback)
- [ ] UI shows subtle error note if limits cannot be fetched
- [ ] Client-side validation prevents out-of-range pledges

## Redis Pledge Queue Behavior
- [ ] Pledges appear in queue in order
- [ ] WebSocket events fire:
  - [ ] `pledge_created`
  - [ ] `pledge:processed`
  - [ ] `pledge:queue:update`
- [ ] Queue position updates live
- [ ] Refund flag shown when applicable

## Recent Activity (Merged with Queue)
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

## Pledge Queue UI
Component: `frontend/src/components/PledgeQueue.tsx`
- [ ] Random avatars and truncated usernames visible
- [ ] Estimated ACORN per pledge computed client-side from `auctionState`
- [ ] Real-time updates on queue events

## Pledge Form
Component: `frontend/src/components/PledgeForm.tsx`
- [ ] Uses `auctionState.ceilingReached` (no `auctionStatus` reference)
- [ ] Fetches max pledge info via API (no WS fallback)
- [ ] Proper input validation and error handling

## Backend API
- [ ] `GET /api/auction/status` returns comprehensive status
- [ ] `GET /api/pledges/auction/:auctionId` returns queue items with user addresses
- [ ] `GET /api/pledges/max-pledge/:auctionId` returns limits
- [ ] `POST /api/auth/guest-token` issues token

## Refund Mechanics
- [ ] When ceiling would be exceeded, pledge marked excess
- [ ] Excess amounts refunded; reflected in totals and UI badges

## Auction End Conditions
- [ ] Ends immediately when ceiling reached
- [ ] Ends at 72 hours otherwise
- [ ] UI reflects end state; pledging disabled

## Dev-only Reset (if enabled in your env)
- [ ] Reset endpoint available only in non-production
- [ ] Triggering reset truncates core tables (`User`, `Auction`, `Pledge`, `RefundedPledge`) and reseeds admin + test data
- [ ] Redis auction caches (`auction:*`) are purged
- [ ] New 72-hour auction is created and broadcast to clients
- [ ] Frontend reset button visible in dev and functions without auth token
- [ ] Page reloads after reset

## Accessibility
- [ ] Progress bar has correct role and ARIA attributes
- [ ] Color contrast meets basic readability standards

## Error Handling & Null-Safety
- [ ] All pages/components render without crashing when data is null/missing
- [ ] Network/API errors display user-friendly messages

## Performance
- [ ] No excessive WS messages or re-renders (check Dev Tools)
- [ ] List rendering capped (Recent Activity limit of 10)

## Documentation Parity
- [ ] README’s described features are observable in the app
- [ ] Any new changes are reflected back into `README.md`
