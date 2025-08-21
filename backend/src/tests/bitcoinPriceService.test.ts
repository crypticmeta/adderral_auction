// File: backend/src/tests/bitcoinPriceService.test.ts | Purpose: Unit tests for BitcoinPriceService caching, TTLs, and failure paths
import { redisClient } from '../config/redis';
import { bitcoinPriceService, BitcoinPriceService } from '../services/bitcoinPriceService';

const SERVICE = bitcoinPriceService as BitcoinPriceService;

describe('BitcoinPriceService (live HTTP + Redis TTL verification)', () => {
  beforeEach(async () => {
    await redisClient.del('btc:price:usd');
    await redisClient.del('btc:price:usd:long');
  });

  test('refreshBitcoinPrice caches btc:price:usd (~30m) and btc:price:usd:long (~3d) with correct TTLs', async () => {
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
    // Short cache should be close to 1800s, but allow some slack for execution time
    expect(ttlShort).toBeGreaterThan(1500); // >25m
    expect(ttlShort).toBeLessThanOrEqual(1800); // <=30m
    // Long cache is configured for 3 days (259200s). Allow <= target and comfortably above 2 days.
    expect(ttlLong).toBeGreaterThan(2 * 24 * 60 * 60); // >172800s
    expect(ttlLong).toBeLessThanOrEqual(3 * 24 * 60 * 60); // <=259200s

    // Subsequent get should use cache (same value as cached)
    const price2 = await SERVICE.getBitcoinPrice();
    expect(price2).toBe(parseFloat(cached as string));
  });
});
