// File: backend/src/tests/scheduledTasks.test.ts | Purpose: Test scheduled Bitcoin price refresh cadence and warm-threshold logic
import { startBitcoinPriceRefresh } from '../services/scheduledTasks';
import { redisClient } from '../config/redis';

// Mock price service only (avoid external HTTP)
jest.mock('../services/bitcoinPriceService', () => ({
  __esModule: true,
  bitcoinPriceService: {
    refreshBitcoinPrice: jest.fn(async () => 61000),
  }
}));

describe('scheduledTasks.startBitcoinPriceRefresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('skips refresh when cache TTL > warm threshold (300s)', async () => {
    const { bitcoinPriceService } = jest.requireMock('../services/bitcoinPriceService');
    // Set key with EX 600
    await redisClient.set('btc:price:usd', '60000', 'EX', 600);

    startBitcoinPriceRefresh();

    // Immediately invoked maybeRefreshBitcoinPrice once
    await Promise.resolve();

    expect(bitcoinPriceService.refreshBitcoinPrice).not.toHaveBeenCalled();

    // Advance 15 minutes and run again; keep warm
    jest.advanceTimersByTime(15 * 60 * 1000);

    // Let the scheduled function resolve
    await Promise.resolve();

    expect(bitcoinPriceService.refreshBitcoinPrice).not.toHaveBeenCalled();
  });

  test('triggers refresh when ttl <= 300 or cache missing', async () => {
    const { bitcoinPriceService } = jest.requireMock('../services/bitcoinPriceService');

    // ttl -2 (missing) -> triggers
    await redisClient.del('btc:price:usd');

    startBitcoinPriceRefresh();
    await Promise.resolve();
    expect(bitcoinPriceService.refreshBitcoinPrice).toHaveBeenCalledTimes(1);

    // Next tick after 15m with ttl 120 -> triggers again
    await redisClient.set('btc:price:usd', '60000', 'EX', 120);
    jest.advanceTimersByTime(15 * 60 * 1000);
    await Promise.resolve();
    expect(bitcoinPriceService.refreshBitcoinPrice).toHaveBeenCalledTimes(2);
  });
});
