// File: backend/src/tests/auctionStats.routes.test.ts | Purpose: Tests for GET /api/auction/:id/stats and Redis caching semantics
import express from 'express';
import request from 'supertest';
import auctionRoutes from '../routes/auctionRoutes';
import pledgeRoutes from '../routes/pledgeRoutes';
import { redisClient } from '../config/redis';
import { bitcoinPriceService } from '../services/bitcoinPriceService';
import prisma from '../config/prisma';
import { createActiveAuction } from './utils/testFactories';

let AUCTION_ID: string = '';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auction', auctionRoutes);
  app.use('/api/pledges', pledgeRoutes);
  return app;
};

describe('GET /api/auction/:id/stats', () => {
  const app = buildApp();

  beforeAll(async () => {
    // Clear Redis keys used in controller
    try {
      const keys = await redisClient.keys('auction:*');
      if (keys.length) await redisClient.del(...keys);
      const priceKeys = await redisClient.keys('btc:*');
      if (priceKeys.length) await redisClient.del(...priceKeys);
    } catch {}

    // Reseed DB with known auction and pledges
    await request(app).post('/api/auction/reseed').expect(200);

    // Stub BTC price
    jest.spyOn(bitcoinPriceService, 'getBitcoinPrice').mockResolvedValue(50000);
  });

  beforeEach(async () => {
    // Create a dedicated auction for this test
    const created = await createActiveAuction();
    AUCTION_ID = created.id;

    // quick sanity via HTTP to ensure route sees it
    const sanity = await request(app).get(`/api/auction/${AUCTION_ID}`);
    if (sanity.status !== 200) {
      // eslint-disable-next-line no-console
      console.error('Sanity GET /api/auction/:id failed', sanity.status, sanity.body);
    }
  });

  afterAll(async () => {
    jest.restoreAllMocks();
  });

  it('returns 200 with expected shape and caches stats in Redis', async () => {
    const res = await request(app).get(`/api/auction/${AUCTION_ID}/stats`);
    expect(res.status).toBe(200);
    const body = res.body ?? {};

    // Validate minimal shape and types with null checks
    expect(body.auctionId).toBe(AUCTION_ID);
    expect(typeof body.totalTokens).toBe('number');
    expect(typeof body.isActive).toBe('boolean');
    expect(typeof body.isCompleted).toBe('boolean');
    expect(typeof body.ceilingMarketCap).toBe('number');
    expect(typeof body.currentMarketCap).toBe('number');
    expect(typeof body.ceilingReached).toBe('boolean');
    expect(typeof body.totalBTCPledged).toBe('number');
    expect(typeof body.percentageFilled).toBe('number');
    expect(typeof body.pledgeCount).toBe('number');
    expect(typeof body.averagePledge).toBe('number');
    expect(typeof body.largestPledge).toBe('number');
    expect(typeof body.smallestPledge).toBe('number');
    expect(typeof body.uniqueParticipants).toBe('number');
    expect(typeof body.refundedPledgeCount).toBe('number');
    expect(typeof body.refundedBTC === 'number' || body.refundedBTC === 0).toBe(true);
    expect(body.startTime).toBeTruthy();
    expect(body.endTime).toBeTruthy();

    // Redis cache check
    const key = `auction:${AUCTION_ID}:stats`;
    const cached = await redisClient.get(key);
    expect(cached).toBeTruthy();
    const ttl = await redisClient.ttl(key);
    // Should be set with ~60s expiry; allow some leeway
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(65);

    const parsed = JSON.parse(cached as string);
    expect(parsed.auctionId).toBe(AUCTION_ID);
  });

  it('returns 404 for non-existent auction', async () => {
    const res = await request(app).get('/api/auction/does-not-exist/stats');
    expect(res.status).toBe(404);
    expect(((res.body?.message || '') as string).toLowerCase()).toContain('auction');
  });
});
