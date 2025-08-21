// File: backend/src/tests/scheduledTasks.test.ts | Purpose: Verify Bitcoin price scheduler immediate run, warm-threshold logic, and TTL behavior without long waits
import { startBitcoinPriceRefresh, stopBitcoinPriceRefresh } from '../services/scheduledTasks';
import { redisClient } from '../config/redis';
import { bitcoinPriceService } from '../services/bitcoinPriceService';

describe('Scheduled Bitcoin price refresh (immediate + warm-threshold)', () => {
  beforeEach(async () => {
    await redisClient.del('btc:price:usd');
    await redisClient.del('btc:price:usd:long');
    jest.clearAllMocks();
  });

  afterEach(() => {
    stopBitcoinPriceRefresh();
  });

  const waitFor = (ms: number) => new Promise((r) => setTimeout(r, ms));

  test('runs refresh immediately when key missing (ttl = -2) and sets a positive TTL', async () => {
    const spy = jest
      .spyOn(bitcoinPriceService, 'refreshBitcoinPrice')
      .mockImplementationOnce(async () => {
        // Simulate service side-effects: set both Redis keys with expected TTLs
        await redisClient.set('btc:price:usd', '12345', 'EX', 30 * 60);
        await redisClient.set('btc:price:usd:long', '12345', 'EX', 3 * 24 * 60 * 60);
        return 12345;
      });

    startBitcoinPriceRefresh();

    // Give the immediate run a moment to execute
    await waitFor(300);

    expect(spy).toHaveBeenCalledTimes(1);

    const val = await redisClient.get('btc:price:usd');
    expect(val).not.toBeNull();
    const ttl = await redisClient.ttl('btc:price:usd');
    expect(ttl).toBeGreaterThan(0);
  });

  test('does NOT refresh when cache is warm (ttl well above warm-threshold)', async () => {
    // Seed a warm cache with high TTL (e.g., close to 30m)
    await redisClient.set('btc:price:usd', '11111', 'EX', 25 * 60); // 25 minutes > 5 min threshold

    const spy = jest
      .spyOn(bitcoinPriceService, 'refreshBitcoinPrice')
      .mockResolvedValue(22222);

    startBitcoinPriceRefresh();
    await waitFor(300);

    // Since warm, the immediate check should NOT trigger a refresh
    expect(spy).not.toHaveBeenCalled();
  });

  test('refreshes when cache TTL is at/below warm-threshold (simulate near expiry)', async () => {
    // Simulate near expiry by setting a small TTL (<= 5 minutes)
    await redisClient.set('btc:price:usd', '33333', 'EX', 60); // 1 minute <= 5 minutes threshold

    const spy = jest
      .spyOn(bitcoinPriceService, 'refreshBitcoinPrice')
      .mockResolvedValueOnce(44444);

    startBitcoinPriceRefresh();
    await waitFor(300);

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
