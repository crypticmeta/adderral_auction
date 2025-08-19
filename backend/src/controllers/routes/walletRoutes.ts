import express from 'express';
import { connectWallet, disconnectWallet, getWalletDetails } from '../walletController';

const router = express.Router();

// Wallet routes
router.post('/connect', connectWallet);
router.post('/disconnect', disconnectWallet);
router.get('/details/:userId', getWalletDetails);

export default router;
