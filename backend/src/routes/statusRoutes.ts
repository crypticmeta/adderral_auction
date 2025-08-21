// statusRoutes.ts
// Purpose: Expose backend runtime status for env guard (network/testing)
import { Router } from 'express';
import config from '../config/config';

const router = Router();

router.get('/', (_req, res) => {
  try {
    return res.status(200).json({
      network: config.btcNetwork,
      testing: Boolean(config.testing),
      nodeEnv: config.nodeEnv,
    });
  } catch (e: any) {
    return res.status(500).json({ error: 'status_unavailable', message: e?.message ?? 'Unknown error' });
  }
});

export default router;
