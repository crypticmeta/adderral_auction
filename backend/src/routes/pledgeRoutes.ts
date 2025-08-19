import express from 'express';
import {
  createPledge,
  verifyPledge,
  getPledges,
  getUserPledges,
  calculateMaxPledge,
  processNextPledge
} from '../controllers/pledgeController';

const router = express.Router();

// Create a new pledge
router.post('/', createPledge);

// Verify a pledge with a transaction ID
router.post('/verify', verifyPledge);

// Get all pledges for an auction
router.get('/auction/:auctionId', getPledges);

// Get pledges for a specific user in an auction
router.get('/user/:userId/auction/:auctionId', getUserPledges);

// Calculate maximum pledge amount for an auction
router.get('/max-pledge/:auctionId', calculateMaxPledge);

// Process the next pledge in the queue
router.post('/process-next/:auctionId', processNextPledge);

export default router;
