// File: backend/src/tests/scheduledTasks.test.ts | Purpose: Test scheduled Bitcoin price refresh cadence and warm-threshold logic
import { startBitcoinPriceRefresh } from '../services/scheduledTasks';

// Mock Redis and price service used by scheduledTasks
jest.mock('../config/redis', () => {
  return {
    __esModule: true,
    redisClient: {
      ttl: jest.fn(async () => 100),
      get: jest.fn(async () => '60000'),
    },
    default: {}
  };
});

jest.mock('../services/bitcoinPriceService', () => {
  return {
    __esModule: true,
    bitcoinPriceService: {
      refreshBitcoinPrice: jest.fn(async () => 61000),
    }
  };
});

describe('scheduledTasks.startBitcoinPriceRefresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('skips refresh when cache TTL > warm threshold (300s)', async () => {
    const { redisClient } = jest.requireMock('../config/redis');
    const { bitcoinPriceService } = jest.requireMock('../services/bitcoinPriceService');

    // TTL 600s -> skip
    (redisClient.ttl as jest.Mock).mockResolvedValueOnce(600);

    startBitcoinPriceRefresh();

    // Immediately invoked maybeRefreshBitcoinPrice once
    await Promise.resolve();

    expect(bitcoinPriceService.refreshBitcoinPrice).not.toHaveBeenCalled();

    // Advance 15 minutes and run again; keep warm
    (redisClient.ttl as jest.Mock).mockResolvedValueOnce(700);
    jest.advanceTimersByTime(15 * 60 * 1000);

    // Let the scheduled function resolve
    await Promise.resolve();

    expect(bitcoinPriceService.refreshBitcoinPrice).not.toHaveBeenCalled();
  });

  test('triggers refresh when ttl <= 300 or cache missing', async () => {
    const { redisClient } = jest.requireMock('../config/redis');
    const { bitcoinPriceService } = jest.requireMock('../services/bitcoinPriceService');

    // ttl -2 (missing) -> triggers
    (redisClient.ttl as jest.Mock).mockResolvedValueOnce(-2);

    startBitcoinPriceRefresh();
    await Promise.resolve();
    expect(bitcoinPriceService.refreshBitcoinPrice).toHaveBeenCalledTimes(1);

    // Next tick after 15m with ttl 120 -> triggers again
    (redisClient.ttl as jest.Mock).mockResolvedValueOnce(120);
    jest.advanceTimersByTime(15 * 60 * 1000);
    await Promise.resolve();
    expect(bitcoinPriceService.refreshBitcoinPrice).toHaveBeenCalledTimes(2);
  });
});
