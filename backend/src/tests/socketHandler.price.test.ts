// File: backend/src/tests/socketHandler.price.test.ts | Purpose: Verify sendAuctionStatus emits priceError and computed fields correctly
import { PrismaClient } from '../generated/prisma';

// Mock bitcoin price service only
jest.mock('../services/bitcoinPriceService', () => ({
  __esModule: true,
  bitcoinPriceService: {
    getBitcoinPrice: jest.fn(),
  },
}));

type EmittedEvent = { event: string; payload: any };
const makeSocket = () => {
  const emits: EmittedEvent[] = [];
  return {
    emitted: emits,
    emit: (event: string, payload: any) => { emits.push({ event, payload }); },
  } as any;
};

describe('sendAuctionStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('emits auction_status with priceError=false and computed fields when BTC price available', async () => {
    const { bitcoinPriceService } = jest.requireMock('../services/bitcoinPriceService');
    ;(bitcoinPriceService.getBitcoinPrice as jest.Mock).mockResolvedValue(60000);

    // Seed DB
    const prisma = new PrismaClient();
    const auc = await prisma.auction.create({
      data: {
        isActive: true,
        isCompleted: false,
        endTime: new Date(Date.now() + 60_000),
        startTime: new Date(Date.now() - 1000),
        totalBTCPledged: 1.23,
        refundedBTC: 0,
        totalTokens: 100_000_000,
        ceilingMarketCap: 15_000_000,
        minPledge: 0.001,
        maxPledge: 0.5,
      }
    });

    let sendAuctionStatus: any;
    jest.isolateModules(() => {
      const mod = require('../websocket/socketHandler');
      sendAuctionStatus = mod.sendAuctionStatus;
    });

    const socket = makeSocket();
    await sendAuctionStatus(socket);

    // Assert
    const evt = (socket.emitted as EmittedEvent[]).find((ev: EmittedEvent) => ev.event === 'auction_status');
    expect(evt).toBeTruthy();
    const p = (evt as EmittedEvent).payload;
    expect(p.id).toBe(auc.id);
    expect(p.priceError).toBe(false);
    expect(p.currentMarketCap).toBeCloseTo(1.23 * 60000, 5);
    expect(p.currentPrice).toBeCloseTo((1.23 * 60000) / 100_000_000, 10);
    // Payload completeness checks
    expect(p.totalTokens).toBe(100_000_000);
    expect(p.ceilingMarketCap).toBe(15_000_000);
    expect(typeof p.minPledge).toBe('number');
    expect(typeof p.maxPledge).toBe('number');
    expect(p.refundedBTC).toBe(0);
    expect(p.startTime).toBeTruthy();
    expect(p.endTime).toBeTruthy();
    expect(typeof p.serverTime).toBe('number');
    expect(typeof p.remainingTime).toBe('number');
    expect(typeof p.ceilingReached).toBe('boolean');
  });

  test('emits auction_status with priceError=true and zeroed price-dependent fields when BTC price unavailable', async () => {
    const { bitcoinPriceService } = jest.requireMock('../services/bitcoinPriceService');
    ;(bitcoinPriceService.getBitcoinPrice as jest.Mock).mockRejectedValue(new Error('fail'));

    // Seed DB
    const prisma = new PrismaClient();
    const auc = await prisma.auction.create({
      data: {
        isActive: true,
        isCompleted: false,
        endTime: new Date(Date.now() + 60_000),
        startTime: new Date(Date.now() - 1000),
        totalBTCPledged: 2,
        refundedBTC: 0,
        totalTokens: 50_000,
        ceilingMarketCap: 15_000_000,
        minPledge: 0.001,
        maxPledge: 0.5,
      }
    });

    let sendAuctionStatus: any;
    jest.isolateModules(() => {
      const mod = require('../websocket/socketHandler');
      sendAuctionStatus = mod.sendAuctionStatus;
    });

    const socket = makeSocket();
    await sendAuctionStatus(socket);

    const evt = (socket.emitted as EmittedEvent[]).find((ev: EmittedEvent) => ev.event === 'auction_status');
    expect(evt).toBeTruthy();
    const p = (evt as EmittedEvent).payload;
    expect(p.priceError).toBe(true);
    expect(p.currentMarketCap).toBe(0);
    expect(p.currentPrice).toBe(0);
    // Still includes base fields
    expect(p.id).toBe(auc.id);
    expect(p.totalTokens).toBe(50_000);
    expect(p.ceilingMarketCap).toBe(15_000_000);
    expect(typeof p.minPledge).toBe('number');
    expect(typeof p.maxPledge).toBe('number');
    expect(p.startTime).toBeTruthy();
    expect(p.endTime).toBeTruthy();
    expect(typeof p.serverTime).toBe('number');
  });
});
