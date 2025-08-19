// File: backend/src/tests/bitcoinPriceService.test.ts | Purpose: Unit tests for BitcoinPriceService caching and failure paths
import { redisClient } from '../config/redis';
import { bitcoinPriceService, BitcoinPriceService } from '../services/bitcoinPriceService';

const SERVICE = bitcoinPriceService as BitcoinPriceService;

describe('BitcoinPriceService (live HTTP)', () => {
  beforeEach(async () => {
    await redisClient.del('btc:price:usd');
    await redisClient.del('btc:price:usd:long');
  });

  test('refreshBitcoinPrice fetches live price and caches short/long with TTLs', async () => {
    const price = await SERVICE.refreshBitcoinPrice();

    // Basic sanity on live price
    expect(typeof price).toBe('number');
    expect(price).toBeGreaterThan(1000);
    expect(price).toBeLessThan(200000);

    const cached = await redisClient.get('btc:price:usd');
    const cachedLong = await redisClient.get('btc:price:usd:long');
    expect(cached).not.toBeNull();
    expect(cachedLong).not.toBeNull();

    const ttlShort = await redisClient.ttl('btc:price:usd');
    const ttlLong = await redisClient.ttl('btc:price:usd:long');
    expect(ttlShort).toBeGreaterThan(0);
    expect(ttlShort).toBeLessThanOrEqual(1800);
    expect(ttlLong).toBeGreaterThan(24 * 60 * 60);

    // Subsequent get should use cache (same value as cached)
    const price2 = await SERVICE.getBitcoinPrice();
    expect(price2).toBe(parseFloat(cached as string));
  });
});
