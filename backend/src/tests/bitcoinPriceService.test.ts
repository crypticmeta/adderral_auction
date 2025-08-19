// File: backend/src/tests/bitcoinPriceService.test.ts | Purpose: Unit tests for BitcoinPriceService caching and failure paths
import axios from 'axios';
import { redisClient } from '../config/redis';
import { bitcoinPriceService, BitcoinPriceService } from '../services/bitcoinPriceService';

// Mock axios only (external HTTP)
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const SERVICE = bitcoinPriceService as BitcoinPriceService;

describe('BitcoinPriceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('fetches from sources, computes median, caches short and long with correct TTLs', async () => {
    // Arrange: respond by URL (parallel-safe)
    mockedAxios.get.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('binance.com')) {
        return { data: { price: '60000' } } as any;
      }
      if (typeof url === 'string' && url.includes('bitfinex.com')) {
        return { data: [0, 0, 0, 0, 0, 0, 61000] } as any; // index 6
      }
      if (typeof url === 'string' && url.includes('huobi.pro')) {
        return { data: { tick: { close: '59000' } } } as any;
      }
      throw new Error('unexpected url');
    });

    // Act
    const price = await SERVICE.refreshBitcoinPrice();

    // Assert
    expect(price).toBe(60000);
    const cached = await redisClient.get('btc:price:usd');
    const cachedLong = await redisClient.get('btc:price:usd:long');
    expect(cached).toBe('60000');
    expect(cachedLong).toBe('60000');
    const ttlShort = await redisClient.ttl('btc:price:usd');
    const ttlLong = await redisClient.ttl('btc:price:usd:long');
    expect(ttlShort).toBeGreaterThan(0);
    expect(ttlShort).toBeLessThanOrEqual(1800);
    expect(ttlLong).toBeGreaterThan(24 * 60 * 60); // > 1 day

    // Subsequent get should come from cache without axios calls
    mockedAxios.get.mockClear();
    const price2 = await SERVICE.getBitcoinPrice();
    expect(price2).toBe(60000);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  test('long-cache fallback used when fresh fetch fails', async () => {
    // Seed long cache only
    await redisClient.del('btc:price:usd');
    await redisClient.set('btc:price:usd:long', '55555', 'EX', 60 * 60);
    // All axios calls fail
    mockedAxios.get.mockRejectedValue(new Error('network error'));

    const price = await SERVICE.getBitcoinPrice();
    expect(price).toBe(55555);
  });

  test('throws when no cache and all sources fail', async () => {
    await redisClient.del('btc:price:usd');
    await redisClient.del('btc:price:usd:long');
    mockedAxios.get.mockRejectedValue(new Error('down'));
    await expect(SERVICE.getBitcoinPrice()).rejects.toThrow('Unable to obtain valid BTC price');
  });
});
