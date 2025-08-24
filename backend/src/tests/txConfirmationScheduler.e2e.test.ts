// File: backend/src/tests/txConfirmationScheduler.e2e.test.ts | Purpose: Verify tx-confirmation scheduler marks pledges as confirmed/pending using real mempool txids
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { PrismaClient } from '../generated/prisma';

// Ensure TESTING short-circuit is disabled for this test (must be set before importing the service)
process.env.TESTING = 'false';

// Lazy import after env set
const { txConfirmationService } = require('../services/txConfirmationService');

const prisma = new PrismaClient();

type TxidsJson = { txids: string[] };

const MEMPOOL_RECENT = 'https://mempool.space/api/mempool/recent';
const MEMPOOL_STATUS = (txid: string) => `https://mempool.space/api/tx/${txid}/status`;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Tx Confirmation Scheduler (real mempool check)', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    try { await prisma.$disconnect(); } catch {}
  });

  const seedUser = async (id: string) => {
    return prisma.user.create({
      data: {
        id,
        connected: true,
        wallet: 'Xverse',
        network: 'mainnet',
      },
    });
  };

  const seedAuction = async () => {
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    return prisma.auction.create({
      data: {
        totalTokens: 1_000_000,
        tokensOnSale: 1_000_000,
        ceilingMarketCap: 50_000_000,
        startTime: now,
        endTime: end,
        isActive: true,
        isCompleted: false,
        minPledgeSats: 100_000,
        maxPledgeSats: 100_000_000,
        network: 'MAINNET',
      },
    });
  };

  const pickConfirmedTxid = async (): Promise<string> => {
    const jsonPath = path.resolve(__dirname, '../../../frontend/public/txids.json');
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as TxidsJson;
    for (const txid of parsed.txids.slice(0, 50)) {
      try {
        const { data } = await axios.get(MEMPOOL_STATUS(txid), { timeout: 8000 });
        if (data && data.confirmed === true) return txid;
      } catch {}
      // small backoff to avoid rate limits
      await wait(100);
    }
    throw new Error('Could not find a confirmed txid from txids.json sample window');
  };

  const fetchPendingTxid = async (): Promise<string> => {
    const { data } = await axios.get(MEMPOOL_RECENT, { timeout: 8000 });
    if (!Array.isArray(data) || data.length === 0) throw new Error('No recent mempool txs');
    const first = data.find((t: any) => t && typeof t.txid === 'string');
    if (!first) throw new Error('No valid txid in mempool recent');
    return first.txid as string;
  };

  test('marks confirmed pledge as verified and pending pledge stays pending', async () => {
    const [user, auction] = await Promise.all([
      seedUser(`u_${Date.now()}`),
      seedAuction(),
    ]);

    // Acquire txids from mempool and repo json
    const [confirmedTxid, pendingTxid] = await Promise.all([
      pickConfirmedTxid(),
      fetchPendingTxid(),
    ]);

    // Seed pledges
    const pConfirmed = await prisma.pledge.create({
      data: {
        userId: user.id,
        auctionId: auction.id,
        satAmount: 200_000,
        depositAddress: 'bc1q-dep-test',
        txid: confirmedTxid,
        network: 'MAINNET',
      },
    });

    const pPending = await prisma.pledge.create({
      data: {
        userId: user.id,
        auctionId: auction.id,
        satAmount: 300_000,
        depositAddress: 'bc1q-dep-test-2',
        txid: pendingTxid,
        network: 'MAINNET',
      },
    });

    // Run the checker
    await txConfirmationService.checkUnverifiedPledges(null);

    // Re-fetch
    const [uConfirmed, uPending] = await Promise.all([
      prisma.pledge.findUnique({ where: { id: pConfirmed.id } }),
      prisma.pledge.findUnique({ where: { id: pPending.id } }),
    ]);

    // Null checks
    expect(uConfirmed).toBeTruthy();
    expect(uPending).toBeTruthy();

    // Confirmed pledge expectations
    expect(uConfirmed?.verified).toBe(true);
    expect(uConfirmed?.status).toBe('confirmed');
    expect((uConfirmed?.confirmations ?? 0)).toBeGreaterThanOrEqual(1);

    // Pending pledge expectations
    expect(uPending?.verified).toBe(false);
    expect(uPending?.status).toBe('pending');
  });
});
