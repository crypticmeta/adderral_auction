// walletRoutes.ts (legacy)
// Purpose: This file previously exposed single-wallet connect/disconnect/details routes.
// Change: These routes have been removed in favor of multi-wallet connect under
// `backend/src/routes/auctionRoutes.ts` -> POST /api/auction/connect-multi-wallet.
// We export an empty router to avoid accidental exposure and to keep imports safe.

import express from 'express';
const router = express.Router();

export default router;
