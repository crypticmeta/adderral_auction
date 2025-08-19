// File: backend/src/tests/scheduledTasks.test.ts | Purpose: Test scheduled Bitcoin price refresh cadence and warm-threshold logic
import { startBitcoinPriceRefresh, stopBitcoinPriceRefresh } from '../services/scheduledTasks';
import { redisClient } from '../config/redis';

describe('scheduledTasks.startBitcoinPriceRefresh (live)', () => {
  beforeEach(async () => {
    await redisClient.del('btc:price:usd');
    await redisClient.del('btc:price:usd:long');
  });

  afterEach(() => {
    stopBitcoinPriceRefresh();
  });

  const waitForKey = async (key: string, timeoutMs = 10000) => {
    const start = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const v = await redisClient.get(key);
      if (v != null) return v;
      if (Date.now() - start > timeoutMs) return null;
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  test('initial run populates cache when missing (ttl -2)', async () => {
    startBitcoinPriceRefresh();
    const val = await waitForKey('btc:price:usd');
    expect(val).not.toBeNull();
    const ttl = await redisClient.ttl('btc:price:usd');
    expect(ttl).toBeGreaterThan(0);
  });
});
