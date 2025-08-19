import express from 'express';
import {
  createAuction,
  getAuction,
  getAllAuctions,
  updateAuctionStatus,
  connectWallet,
  connectMultiWallet,
  getAuctionPledges,
  getUserAllocation,
  getAuctionStats,
  searchAuctions,
  resetAuction
} from '../controllers/auctionController';
import { authenticateJWT } from '../middleware/auth';
import { verifyAdminAccess } from './api/auction/reset';

const router = express.Router();

// Public routes
router.get('/', getAllAuctions);
router.get('/search', searchAuctions);
router.get('/:id', getAuction);
router.get('/:id/stats', getAuctionStats);
router.get('/:auctionId/pledges', getAuctionPledges);

// Protected routes (require authentication)
router.post('/', authenticateJWT, createAuction);
router.patch('/:id/status', authenticateJWT, updateAuctionStatus);
router.post('/connect-wallet', authenticateJWT, connectWallet);
router.post('/connect-multi-wallet', authenticateJWT, connectMultiWallet);
router.get('/user/:userId/auction/:auctionId/allocation', authenticateJWT, getUserAllocation);

// Dev-only reset route
router.post('/reset', verifyAdminAccess, resetAuction);

export default router;
