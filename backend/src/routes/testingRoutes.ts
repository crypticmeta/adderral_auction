// File: backend/src/routes/testingRoutes.ts
// Purpose: Testing-only endpoints gated by TESTING env to reset pledges and seed random users/pledges.

import express, { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import config from '../config/config';
import { bitcoinPriceService } from '../services/bitcoinPriceService';
import { PledgeQueueService } from '../services/pledgeQueueService';

const router = express.Router();
const pledgeQueueService = PledgeQueueService.getInstance();

const toEnumNetwork = (n: string | null | undefined) =>
  (String(n).toLowerCase() === 'testnet' ? 'TESTNET' : 'MAINNET');

// Middleware: require TESTING enabled
const requireTestingEnabled = (req: Request, res: Response, next: NextFunction) => {
  if (!config.testing) {
    return res.status(403).json({ error: 'Testing endpoints are disabled. Set TESTING=true to enable.' });
  }
  next();
};

// POST /api/testing/create-test-user
// Body: { userId?: string, wallet?: string, cardinal?: string, ordinal?: string, cardinalPubkey?: string, ordinalPubkey?: string, network?: 'mainnet'|'testnet' }
router.post('/create-test-user', requireTestingEnabled, async (req: Request, res: Response) => {
  try {
    const body = (req?.body ?? {}) as any;
    const nowId = `test_user_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const userId: string = (typeof body.userId === 'string' && body.userId.trim().length > 0) ? body.userId.trim() : nowId;

    const wallet: string | null = typeof body.wallet === 'string' && body.wallet.trim() ? body.wallet.trim() : null;
    const cardinal: string | null = typeof body.cardinal === 'string' && body.cardinal.trim() ? body.cardinal.trim() : null;
    const ordinal: string | null = typeof body.ordinal === 'string' && body.ordinal.trim() ? body.ordinal.trim() : null;
    const cardinalPubkey: string | null = typeof body.cardinalPubkey === 'string' && body.cardinalPubkey.trim() ? body.cardinalPubkey.trim() : null;
    const ordinalPubkey: string | null = typeof body.ordinalPubkey === 'string' && body.ordinalPubkey.trim() ? body.ordinalPubkey.trim() : null;
    const netIn: string | null = typeof body.network === 'string' && body.network.trim() ? body.network.trim() : null;

    // Normalize to lower-case string for DB string field; align with config when missing
    const normalizedNetwork: string = (netIn ?? String(config.btcNetwork || 'mainnet')).toLowerCase();

    const user = await prisma.user.upsert({
      where: { id: userId },
      update: {
        wallet: wallet ?? undefined,
        cardinal_address: cardinal ?? undefined,
        ordinal_address: ordinal ?? undefined,
        cardinal_pubkey: cardinalPubkey ?? undefined,
        ordinal_pubkey: ordinalPubkey ?? undefined,
        network: normalizedNetwork,
        connected: true,
      },
      create: {
        id: userId,
        wallet,
        cardinal_address: cardinal,
        ordinal_address: ordinal,
        cardinal_pubkey: cardinalPubkey,
        ordinal_pubkey: ordinalPubkey,
        network: normalizedNetwork,
        connected: true,
      },
      select: {
        id: true,
        wallet: true,
        cardinal_address: true,
        ordinal_address: true,
        cardinal_pubkey: true,
        ordinal_pubkey: true,
        network: true,
        connected: true,
        createdAt: true,
      }
    });

    return res.status(200).json({ user });
  } catch (error) {
    console.error('Error creating test user:', error);
    return res.status(500).json({ error: 'Failed to create test user' });
  }
});

// POST /api/testing/reset-pledges
router.post('/reset-pledges', requireTestingEnabled, async (_req: Request, res: Response) => {
  try {
    const auction = await prisma.auction.findFirst({ where: { isActive: true, network: toEnumNetwork(config.btcNetwork) } });
    if (!auction) return res.status(404).json({ error: 'No active auction found' });

    await prisma.$transaction([
      prisma.pledge.deleteMany({ where: { auctionId: auction.id } }),
      prisma.refundedPledge.deleteMany({ where: { auctionId: auction.id } }),
      prisma.auction.update({ where: { id: auction.id }, data: { totalBTCPledged: 0, refundedBTC: 0 } }),
    ]);

    // Clear Redis queue + processed set
    await pledgeQueueService.clearAll();

    return res.status(200).json({ message: 'Pledges reset successfully', auctionId: auction.id });
  } catch (error) {
    console.error('Error resetting pledges:', error);
    return res.status(500).json({ error: 'Failed to reset pledges' });
  }
});

// POST /api/testing/seed-random
// Body: { users?: number, pledges?: number, targetPercent?: number (0-110), process?: boolean }
router.post('/seed-random', requireTestingEnabled, async (req: Request, res: Response) => {
  try {
    const auction = await prisma.auction.findFirst({ where: { isActive: true, network: toEnumNetwork(config.btcNetwork) } });
    if (!auction) return res.status(404).json({ error: 'No active auction found' });

    const usersCount = Math.max(1, Math.min(200, Number(req.body?.users ?? 10)));
    const pledgesCount = Math.max(1, Math.min(1000, Number(req.body?.pledges ?? 25)));
    const processAfter = (req.body?.process ?? true) === true;
    const targetPercent = Math.max(0, Math.min(110, Number(req.body?.targetPercent ?? (Math.random() * 110))));
    // Optional staggered delays to simulate real users creating pledges over time
    const staggerMinMs = Math.max(0, Math.min(10000, Number(req.body?.staggerMinMs ?? 50)));
    const staggerMaxMs = Math.max(staggerMinMs, Math.min(20000, Number(req.body?.staggerMaxMs ?? 400)));
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Ensure BTC price available to translate USD ceiling -> BTC
    const btcPrice = await bitcoinPriceService.getBitcoinPrice();
    if (!(btcPrice > 0)) {
      return res.status(503).json({ error: 'BTC price unavailable; cannot compute target BTC from USD ceiling' });
    }

    // Compute target BTC amount based on percent of USD ceiling
    const targetBTC = (auction.ceilingMarketCap * (targetPercent / 100)) / btcPrice;

    // Create users
    const baseTs = Date.now();
    const userIds: string[] = [];
    for (let i = 0; i < usersCount; i++) {
      const id = `test_user_${baseTs}_${i}`;
      userIds.push(id);
    }

    // Upsert users in batch
    await prisma.$transaction(userIds.map(id => prisma.user.upsert({
      where: { id },
      update: {},
      create: {
        id,
        connected: true,
        network: String(config.btcNetwork || 'mainnet').toLowerCase(),
      },
    })));

    // Generate pledge amounts (BTC) within min/max bounds aiming for target sum
    const minBTC = (auction.minPledgeSats ?? 0) / 1e8;
    const maxBTC = (auction.maxPledgeSats ?? 0) / 1e8;

    const randomInRange = (min: number, max: number) => min + Math.random() * (max - min);

    const amounts: number[] = [];
    let remaining = targetBTC;
    for (let i = 0; i < pledgesCount; i++) {
      // Weight later pledges smaller to better fit target
      const frac = Math.max(0.2, 1 - i / pledgesCount);
      const tentative = Math.min(maxBTC, Math.max(minBTC, remaining * frac));
      const amt = Math.min(maxBTC, Math.max(minBTC, randomInRange(tentative * 0.6, tentative * 1.4)));
      amounts.push(Number(amt.toFixed(8)));
      remaining = Math.max(0, remaining - amt);
    }

    // Create pledges and enqueue
    let created = 0;
    for (let i = 0; i < amounts.length; i++) {
      // Random break before creating each pledge to mimic human activity
      const jitter = Math.floor(staggerMinMs + Math.random() * (staggerMaxMs - staggerMinMs));
      if (jitter > 0) {
        await sleep(jitter);
      }
      const sats = Math.max(1, Math.round(amounts[i] * 1e8));
      const userId = userIds[Math.floor(Math.random() * userIds.length)];
      const txid = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      const depositAddress = `test_deposit_${baseTs}_${i}`;

      const pledge = await prisma.pledge.create({
        data: {
          userId,
          satAmount: sats,
          auctionId: auction.id,
          depositAddress,
          signature: null,
          cardinal_address: null,
          ordinal_address: null,
          network: auction.network,
          processed: false,
          needsRefund: false,
          txid,
          status: 'pending',
          confirmations: 0,
          verified: false,
        },
        include: { user: true },
      });

      await pledgeQueueService.enqueuePledge({
        id: pledge.id,
        userId: pledge.userId,
        btcAmount: sats / 1e8,
        auctionId: pledge.auctionId,
        timestamp: pledge.timestamp.toISOString(),
        sender: pledge.cardinal_address || '',
        depositAddress: pledge.depositAddress || '',
        signature: pledge.signature // string | null as per shared types
      });

      created += 1;
    }

    // Optionally process the queue to update totalBTCPledged and refund overflow
    let processed = 0;
    let refunded = 0;
    if (processAfter) {
      // Re-fetch auction to get latest totals each iteration
      // Loop until queue empty
      // Safeguard: cap iterations
      for (let i = 0; i < created + 5; i++) {
        const fresh = await prisma.auction.findUnique({ where: { id: auction.id } });
        if (!fresh) break;
        const result = await pledgeQueueService.processNextPledge(fresh.ceilingMarketCap, fresh.totalBTCPledged);
        if (!result) break;
        processed += 1;
        if (result.needsRefund) refunded += 1;
        // If not refund, increment auction total (mirror controller behavior)
        if (!result.needsRefund) {
          await prisma.auction.update({
            where: { id: auction.id },
            data: { totalBTCPledged: { increment: result.btcAmount } },
          });
        }
      }
    }

    const updatedAuction = await prisma.auction.findUnique({ where: { id: auction.id } });

    return res.status(200).json({
      message: 'Seeded random users and pledges',
      usersCreated: userIds.length,
      pledgesCreated: created,
      pledgesProcessed: processed,
      pledgesRefunded: refunded,
      targetPercent,
      finalTotalBTCPledged: updatedAuction?.totalBTCPledged ?? 0,
      auctionId: auction.id,
    });
  } catch (error) {
    console.error('Error seeding random pledges:', error);
    return res.status(500).json({ error: 'Failed to seed random pledges' });
  }
});

export default router;
