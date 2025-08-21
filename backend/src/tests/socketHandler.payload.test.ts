// File: backend/src/tests/socketHandler.payload.test.ts | Purpose: Validate auction_status payload completeness across scenarios (active/price ok, price error, ceiling reached) and pledges include user addresses
import { PrismaClient } from '../generated/prisma';

// Simple socket test double that records emissions
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
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const found = (socket.emitted as EmittedEvent[]).find((ev: EmittedEvent) => ev.event === event);
    if (found) return found;
    if (Date.now() - start > timeoutMs) return undefined;
    await new Promise((r) => setTimeout(r, 50));
  }
};

describe('sendAuctionStatus payload completeness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('includes full payload and pledge user addresses when price is available', async () => {
    const prisma = new PrismaClient();

    // Seed user and pledge
    const user = await prisma.user.create({
      data: {
        id: `u_${Date.now()}`,
        cardinal_address: 'bc1p-cardinal-xyz',
        ordinal_address: 'bc1p-ordinal-xyz',
        connected: true,
        wallet: 'Xverse',
        network: 'testnet',
      }
    });

    const auc = await prisma.auction.create({
      data: {
        isActive: true,
        isCompleted: false,
        endTime: new Date(Date.now() + 60_000),
        startTime: new Date(Date.now() - 1000),
        totalBTCPledged: 0.5,
        refundedBTC: 0,
        totalTokens: 1_000_000,
        ceilingMarketCap: 50_000_000,
        minPledgeSats: 100_000,
        maxPledgeSats: 50_000_000,
        pledges: {
          create: {
            userId: user.id,
            satAmount: 5_000_000, // 0.05 BTC
            depositAddress: 'bc1q-deposit',
            timestamp: new Date(),
            verified: true,
          }
        }
      },
      include: { pledges: true }
    });

    // Mock BTC price positive
    const mockedPrice = 80_000;
    let getSpy: jest.Mock;
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

    const evt = await waitForEvent(socket, 'auction_status');
    expect(evt).toBeTruthy();
    const p = (evt as EmittedEvent).payload;

    // Base fields
    expect(p.id).toBe(auc.id);
    expect(typeof p.isActive).toBe('boolean');
    expect(typeof p.isCompleted).toBe('boolean');
    expect(typeof p.totalBTCPledged).toBe('number');
    expect(typeof p.refundedBTC).toBe('number');
    expect(typeof p.remainingTime).toBe('number');
    expect(typeof p.serverTime).toBe('number');
    expect(p.startTime).toBeTruthy();
    expect(p.endTime).toBeTruthy();
    expect(typeof p.totalTokens).toBe('number');
    expect(typeof p.ceilingMarketCap).toBe('number');
    expect(typeof p.currentMarketCap).toBe('number');
    expect(typeof p.minPledge).toBe('number');
    expect(typeof p.maxPledge).toBe('number');
    expect(typeof p.ceilingReached).toBe('boolean');
    expect(typeof p.currentPrice).toBe('number');
    expect(p.priceError).toBe(false);

    // Pledges array and user addresses
    expect(Array.isArray(p.pledges)).toBe(true);
    expect(p.pledges.length).toBeGreaterThan(0);
    const first = p.pledges[0];
    expect(first).toBeTruthy();
    expect(first.userId).toBe(user.id);
    expect(first.cardinal_address).toBe('bc1p-cardinal-xyz');
    expect(first.ordinal_address).toBe('bc1p-ordinal-xyz');
    expect(typeof first.btcAmount).toBe('number');
    expect(typeof first.verified).toBe('boolean');

    expect(getSpy!).toHaveBeenCalledTimes(1);
  });

  test('marks priceError and zeros price-dependent fields when price unavailable', async () => {
    const prisma = new PrismaClient();
    await prisma.auction.create({
      data: {
        isActive: true,
        isCompleted: false,
        endTime: new Date(Date.now() + 30_000),
        startTime: new Date(Date.now() - 1000),
        totalBTCPledged: 0.1,
        refundedBTC: 0,
        totalTokens: 10_000,
        ceilingMarketCap: 2_000_000,
        minPledgeSats: 100_000,
        maxPledgeSats: 50_000_000,
      }
    });

    let getSpy: jest.Mock;
    let sendAuctionStatus: any;
    jest.isolateModules(() => {
      jest.doMock('../services/bitcoinPriceService', () => {
        const original = jest.requireActual('../services/bitcoinPriceService');
        getSpy = jest.fn().mockRejectedValueOnce(new Error('no price'));
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
  });

  test('sets ceilingReached=true when pledged*price >= ceilingMarketCap', async () => {
    const prisma = new PrismaClient();
    const auc = await prisma.auction.create({
      data: {
        isActive: true,
        isCompleted: false,
        endTime: new Date(Date.now() + 45_000),
        startTime: new Date(Date.now() - 1000),
        totalBTCPledged: 1,
        refundedBTC: 0,
        totalTokens: 1_000,
        ceilingMarketCap: 75_000, // choose a price to exceed this
        minPledgeSats: 100_000,
        maxPledgeSats: 50_000_000,
      }
    });

    const mockedPrice = 80_000; // 1 BTC * 80k = 80k >= 75k
    let getSpy: jest.Mock;
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

    const evt = await waitForEvent(socket, 'auction_status');
    expect(evt).toBeTruthy();
    const p = (evt as EmittedEvent).payload;

    expect(p.id).toBe(auc.id);
    expect(p.ceilingReached).toBe(true);
    expect(p.priceError).toBe(false);
    expect(p.currentMarketCap).toBeGreaterThanOrEqual(auc.ceilingMarketCap);
    expect(getSpy!).toHaveBeenCalledTimes(1);
  });
});
