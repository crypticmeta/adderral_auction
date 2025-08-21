// File: backend/src/tests/socketHandler.price.test.ts | Purpose: Verify sendAuctionStatus emits priceError and computed fields correctly (deterministic by mocking BTC price). Uses jest.isolateModules with doMock to ensure the isolated module registry sees the mocked price service.
import { PrismaClient } from '../generated/prisma';
import { createActiveAuction } from './utils/testFactories';

type EmittedEvent = { event: string; payload: any };
const makeSocket = () => {
  const emits: EmittedEvent[] = [];
  return {
    emitted: emits,
    emit: (event: string, payload: any) => { emits.push({ event, payload }); },
  } as any;
};

const waitForEvent = async (socket: any, event: string, timeoutMs = 4000) => {
  const start = Date.now();
  // simple poll loop
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const found = (socket.emitted as EmittedEvent[]).find((ev: EmittedEvent) => ev.event === event);
    if (found) return found;
    if (Date.now() - start > timeoutMs) return undefined;
    await new Promise((r) => setTimeout(r, 50));
  }
};

describe('sendAuctionStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('emits auction_status with priceError=false and computed fields when BTC price available', async () => {
    // Mock BTC price inside the isolated module registry
    const mockedPrice = 100_000; // $100k
    let getSpy: jest.Mock;

    // Seed DB
    const prisma = new PrismaClient();
    const auc = await createActiveAuction({
      totalBTCPledged: 1.23,
      refundedBTC: 0,
      totalTokens: 100_000_000,
      ceilingMarketCap: 15_000_000,
      minPledgeSats: 100_000,
      maxPledgeSats: 50_000_000,
    });

    let sendAuctionStatus: any;
    jest.isolateModules(() => {
      jest.doMock('../services/bitcoinPriceService', () => {
        const original = jest.requireActual('../services/bitcoinPriceService');
        getSpy = jest.fn().mockResolvedValueOnce(mockedPrice);
        return {
          ...original,
          bitcoinPriceService: {
            ...original.bitcoinPriceService,
            getBitcoinPrice: getSpy!
          }
        };
      });
      const mod = require('../websocket/socketHandler');
      sendAuctionStatus = mod.sendAuctionStatus;
    });

    const socket = makeSocket();
    await sendAuctionStatus(socket);

    // Assert (wait for possible async emission)
    const evt = await waitForEvent(socket, 'auction_status');
    expect(evt).toBeTruthy();
    const p = (evt as EmittedEvent).payload;
    expect(p.id).toBe(auc.id);
    expect(p.priceError).toBe(false);
    expect(p.currentMarketCap).toBeGreaterThan(0);
    expect(p.currentPrice).toBeGreaterThan(0);
    expect(getSpy!).toHaveBeenCalledTimes(1);
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
    // Mock rejection inside the isolated module registry
    let getSpy: jest.Mock;
    // Seed DB
    const prisma = new PrismaClient();
    const auc = await createActiveAuction({
      totalBTCPledged: 2,
      refundedBTC: 0,
      totalTokens: 50_000,
      ceilingMarketCap: 15_000_000,
      minPledgeSats: 100_000,
      maxPledgeSats: 50_000_000,
    });

    let sendAuctionStatus: any;
    jest.isolateModules(() => {
      jest.doMock('../services/bitcoinPriceService', () => {
        const original = jest.requireActual('../services/bitcoinPriceService');
        getSpy = jest.fn().mockRejectedValueOnce(new Error('network down'));
        return {
          ...original,
          bitcoinPriceService: {
            ...original.bitcoinPriceService,
            getBitcoinPrice: getSpy!
          }
        };
      });
      const mod = require('../websocket/socketHandler');
      sendAuctionStatus = mod.sendAuctionStatus;
    });

    const socket = makeSocket();
    await sendAuctionStatus(socket);

    const evt = await waitForEvent(socket, 'auction_status');
    expect(evt).toBeTruthy();
    const p = (evt as EmittedEvent).payload;
    expect(p.priceError).toBe(true);
    expect(p.currentMarketCap).toBe(0);
    expect(p.currentPrice).toBe(0);
    expect(getSpy!).toHaveBeenCalledTimes(1);
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
