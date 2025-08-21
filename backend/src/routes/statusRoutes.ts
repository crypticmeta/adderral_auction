// statusRoutes.ts
// Purpose: Expose backend runtime status for env guard (network/testing)
import { Router } from 'express';
import config from '../config/config';
import { bitcoinPriceService } from '../services/bitcoinPriceService';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    let btcUsd: number | null = null;
    try {
      btcUsd = await bitcoinPriceService.getBitcoinPrice();
    } catch {
      btcUsd = null;
    }
    return res.status(200).json({
      network: config.btcNetwork,
      testing: Boolean(config.testing),
      nodeEnv: config.nodeEnv,
      btcUsd,
    });
  } catch (e: any) {
    return res.status(500).json({ error: 'status_unavailable', message: e?.message ?? 'Unknown error' });
  }
});

export default router;
