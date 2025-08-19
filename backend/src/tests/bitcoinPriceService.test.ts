// File: backend/src/tests/bitcoinPriceService.test.ts | Purpose: Unit tests for BitcoinPriceService caching and failure paths
import axios from 'axios';
import { bitcoinPriceService, BitcoinPriceService } from '../services/bitcoinPriceService';

// Mock Redis client used by the service
jest.mock('../config/redis', () => {
  const store: Record<string, { value: string; ex?: number }> = {};
  return {
    __esModule: true,
    redisClient: {
      get: jest.fn(async (k: string) => store[k]?.value ?? null),
      set: jest.fn(async (k: string, v: string, exFlag?: string, ex?: number) => {
        store[k] = { value: v, ex: exFlag === 'EX' ? ex : undefined };
        return 'OK';
      }),
      ttl: jest.fn(async (k: string) => {
        const ex = store[k]?.ex;
        return typeof ex === 'number' ? ex : -2; // -2 when not exists, -1 when no expiry
      }),
      del: jest.fn(async (...keys: string[]) => {
        let c = 0;
        for (const k of keys) {
          if (store[k]) { delete store[k]; c++; }
        }
        return c;
      }),
      keys: jest.fn(async (pattern: string) => Object.keys(store).filter(k => k.includes(pattern.replace('*','')))),
    },
    default: {}
  };
});

// Mock axios
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

    const { redisClient } = jest.requireMock('../config/redis');
    expect(redisClient.set).toHaveBeenCalledWith('btc:price:usd', '60000', 'EX', 1800);
    expect(redisClient.set).toHaveBeenCalledWith('btc:price:usd:long', '60000', 'EX', 259200);

    // Subsequent get should come from cache without axios calls
    (redisClient.get as jest.Mock).mockResolvedValueOnce('60000');
    mockedAxios.get.mockClear();
    const price2 = await SERVICE.getBitcoinPrice();
    expect(price2).toBe(60000);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  test('long-cache fallback used when fresh fetch fails', async () => {
    const { redisClient } = jest.requireMock('../config/redis');
    // No short cache
    (redisClient.get as jest.Mock).mockImplementation(async (k: string) => {
      if (k === 'btc:price:usd') return null;
      if (k === 'btc:price:usd:long') return '55555';
      return null;
    });
    // All axios calls fail
    mockedAxios.get.mockRejectedValue(new Error('network error'));

    const price = await SERVICE.getBitcoinPrice();
    expect(price).toBe(55555);
  });

  test('throws when no cache and all sources fail', async () => {
    const { redisClient } = jest.requireMock('../config/redis');
    (redisClient.get as jest.Mock).mockResolvedValue(null);
    mockedAxios.get.mockRejectedValue(new Error('down'));
    await expect(SERVICE.getBitcoinPrice()).rejects.toThrow('Unable to obtain valid BTC price');
  });
});
