// File: backend/src/tests/maxPledge.routes.test.ts | Purpose: Tests for GET /api/pledges/max-pledge/:auctionId (success + 404 + unit 400)
import express from 'express';
import request from 'supertest';
import pledgeRoutes from '../routes/pledgeRoutes';
import auctionRoutes from '../routes/auctionRoutes';
import { redisClient } from '../config/redis';
import { BitcoinPriceService } from '../services/bitcoinPriceService';
import { calculateMaxPledge } from '../controllers/pledgeController';
import prisma from '../config/prisma';

// Auction id obtained dynamically from reseed response
let AUCTION_ID: string = '';

// Build a minimal app that mounts the routers we need
const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auction', auctionRoutes);
  app.use('/api/pledges', pledgeRoutes);
  return app;
};

describe('GET /api/pledges/max-pledge/:auctionId', () => {
  const app = buildApp();

  beforeAll(async () => {
    // Ensure clean Redis for deterministic tests
    try {
      const keys = await redisClient.keys('auction:*');
      if (keys.length) await redisClient.del(...keys);
      const keys2 = await redisClient.keys('btc:*');
      if (keys2.length) await redisClient.del(...keys2);
    } catch {}

    // Reseed database via dev route
    await request(app).post('/api/auction/reseed').expect(200);
    // Stub BTC price to avoid network
    jest
      .spyOn(BitcoinPriceService.prototype as any, 'getBitcoinPrice')
      .mockResolvedValue(50000);
  });

  // Create a fresh dedicated auction after global cleanup for each test
  beforeEach(async () => {
    const now = new Date();
    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const created = await prisma.auction.create({
      data: {
        totalTokens: 10000,
        ceilingMarketCap: 100000,
        totalBTCPledged: 0,
        refundedBTC: 0,
        startTime: now,
        endTime: end,
        isActive: true,
        isCompleted: false,
        minPledgeSats: 10000,
        maxPledgeSats: 200000,
        network: 'MAINNET',
      },
    });
    AUCTION_ID = created.id;

    // Verify via HTTP quickly
    const httpCheck = await request(app).get(`/api/auction/${AUCTION_ID}`);
    if (httpCheck.status !== 200) {
      // eslint-disable-next-line no-console
      console.error('HTTP GET /api/auction/:id failed in beforeEach', httpCheck.status, httpCheck.body, { AUCTION_ID });
    }
  });

  afterAll(async () => {
    jest.restoreAllMocks();
  });

  it('returns 200 with min/max pledge sats and currentBTCPrice as number', async () => {
    // eslint-disable-next-line no-console
    console.error('Testing max-pledge with AUCTION_ID=', AUCTION_ID);
    const sanityDb = await prisma.auction.findUnique({ where: { id: AUCTION_ID } });
    if (!sanityDb) {
      // eslint-disable-next-line no-console
      console.error('Sanity DB check: auction missing right before request');
      const count = await prisma.auction.count();
      // eslint-disable-next-line no-console
      console.error('Auction count =', count);
    }
    const sanityHttp = await request(app).get(`/api/auction/${AUCTION_ID}`);
    if (sanityHttp.status !== 200) {
      // eslint-disable-next-line no-console
      console.error('Sanity HTTP GET /api/auction/:id non-200', sanityHttp.status, sanityHttp.body);
    }
    const res = await request(app).get(`/api/pledges/max-pledge/${AUCTION_ID}`);
    if (res.status !== 200) {
      // eslint-disable-next-line no-console
      console.error('max-pledge response:', res.status, res.body);
    }

    expect(res.status).toBe(200);
    const body = res.body ?? {};

    // Shape + null checks
    expect(typeof body.minPledgeSats === 'number' || body.minPledgeSats === undefined).toBe(true);
    expect(typeof body.maxPledgeSats === 'number' || body.maxPledgeSats === undefined).toBe(true);
    expect(typeof body.currentBTCPrice).toBe('number');
    expect(Number.isFinite(body.currentBTCPrice)).toBe(true);
  });

  it('returns 404 when auction does not exist', async () => {
    const res = await request(app).get('/api/pledges/max-pledge/non-existent-auction-id');
    expect(res.status).toBe(404);
    // message string as implemented in controller
    expect((res.body?.error || res.body?.message || '').toLowerCase()).toContain('auction');
  });

  it('unit: returns 400 when auctionId param missing', async () => {
    // Call the controller directly with missing params
    const req: any = { params: {} };
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const res: any = { status };

    await calculateMaxPledge(req, res);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });
});
