// File: backend/src/tests/pledgeFlow.e2e.test.ts | Purpose: End-to-end test for pledge creation flow (API + DB + Redis queue + WebSocket emissions)
import express from 'express';
import request from 'supertest';
import pledgeRoutes from '../routes/pledgeRoutes';
import { setSocketServer } from '../controllers/pledgeController';
import { PrismaClient } from '../generated/prisma';
import { redisClient } from '../config/redis';

// Lightweight Socket.IO test double to capture emissions
// Ensures we don't need a real Socket.IO server for controller broadcast

type EmittedEvent = { event: string; payload: any };
const makeIoDouble = () => {
  const emitted: EmittedEvent[] = [];
  const io = {
    emit: (event: string, payload: any) => {
      emitted.push({ event, payload });
    }
  } as any;
  return { io, emitted };
};

// Helpers
const createAppWithRoutes = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/pledges', pledgeRoutes);
  return app;
};

// Use dedicated PrismaClient for tests
const prisma = new PrismaClient();

// Redis keys used by queue service
const QUEUE_KEY = 'auction:pledge:queue';
const PROCESSED_SET_KEY = 'auction:pledge:processed';

// Utility: fetch and parse all queued pledges
const getQueuedPledges = async () => {
  const raw = await redisClient.zrange(QUEUE_KEY, 0, -1);
  return raw.map((s) => {
    try { return JSON.parse(s); } catch { return null; }
  }).filter(Boolean);
};

// Seed helpers
const seedActiveAuction = async () => {
  const now = Date.now();
  return prisma.auction.create({
    data: {
      isActive: true,
      isCompleted: false,
      startTime: new Date(now - 1000),
      endTime: new Date(now + 60_000),
      totalBTCPledged: 0,
      refundedBTC: 0,
      totalTokens: 1_000_000,
      ceilingMarketCap: 50_000_000, // large enough to not trigger refunds
      minPledgeSats: 100_000,       // 0.001 BTC
      maxPledgeSats: 100_000_000,   // 1 BTC
    }
  });
};

const seedUser = async (id: string) => {
  return prisma.user.create({
    data: {
      id,
      cardinal_address: 'tb1p-cardinal-test',
      ordinal_address: 'tb1p-ordinal-test',
      connected: true,
      wallet: 'Xverse',
      network: 'testnet'
    }
  });
};

// Clean up DB collections relevant to pledges/auctions/users
const truncateCoreTables = async () => {
  await prisma.pledge.deleteMany({});
  await prisma.refundedPledge.deleteMany({});
  await prisma.auction.deleteMany({});
  await prisma.user.deleteMany({});
};

// Clean Redis queue keys for isolation (jest.setup also flushes DB, this is defensive)
const flushQueueKeys = async () => {
  try { await redisClient.del(QUEUE_KEY); } catch {}
  try { await redisClient.del(PROCESSED_SET_KEY); } catch {}
};

describe('POST /api/pledges end-to-end', () => {
  beforeEach(async () => {
    await truncateCoreTables();
    await flushQueueKeys();
  });

  afterAll(async () => {
    // Ensure connections are closed cleanly
    try { await prisma.$disconnect(); } catch {}
    try { await redisClient.flushdb(); } catch {}
  });

  test('creates pledge -> returns 201, DB row exists, queued in Redis, WS events emitted', async () => {
    const userId = `u_${Date.now()}`;
    const [user, auction] = await Promise.all([
      seedUser(userId),
      seedActiveAuction()
    ]);
    expect(user?.id).toBe(userId);
    expect(auction?.isActive).toBe(true);

    // Attach fake IO to controller to capture broadcasts
    const { io, emitted } = makeIoDouble();
    setSocketServer(io);

    const app = createAppWithRoutes();

    const body = {
      userId,
      satsAmount: 2_000_000, // 0.02 BTC
      walletDetails: { cardinal: 'tb1p-cardinal-test', ordinal: 'tb1p-ordinal-test' },
      signature: 'sig',
      txid: `txid_${Date.now()}`,
      depositAddress: 'tb1q-deposit-test'
    };

    const res = await request(app).post('/api/pledges').send(body);
    expect(res.status).toBe(201);

    const payload = res.body ?? {};
    expect(typeof payload.id).toBe('string');
    expect(payload.userId).toBe(userId);
    expect(payload.satsAmount).toBe(body.satsAmount);
    expect(payload.txid).toBe(body.txid);
    expect(typeof payload.queuePosition).toBe('number');

    // DB: pledge exists with expected values
    const dbPledge = await prisma.pledge.findUnique({ where: { id: payload.id } });
    expect(dbPledge).toBeTruthy();
    expect(dbPledge?.userId).toBe(userId);
    expect(dbPledge?.satAmount).toBe(body.satsAmount);
    expect(dbPledge?.txid).toBe(body.txid);

    // Redis: queued
    const queued = await getQueuedPledges();
    const found = queued.find((p: any) => p?.id === payload.id);
    expect(found).toBeTruthy();
    expect(found?.userId).toBe(userId);

    // WS: pledge_created and queue position event
    const evCreated = emitted.find((e) => e.event === 'pledge_created');
    expect(evCreated).toBeTruthy();
    expect(evCreated?.payload?.id).toBe(payload.id);

    const evPos = emitted.find((e) => e.event === 'pledge:queue:position');
    expect(evPos).toBeTruthy();
    expect(evPos?.payload?.pledgeId).toBe(payload.id);
  });

  test('allows multiple pledges from same user (no unique constraint)', async () => {
    const userId = `u_${Date.now()}_multi`;
    await seedUser(userId);
    await seedActiveAuction();

    const { io } = makeIoDouble();
    setSocketServer(io);
    const app = createAppWithRoutes();

    const base = {
      userId,
      walletDetails: { cardinal: 'tb1p-cardinal-test', ordinal: 'tb1p-ordinal-test' },
      signature: 'sig'
    };

    const r1 = await request(app).post('/api/pledges').send({ ...base, satsAmount: 100_000, txid: `t1_${Date.now()}`, depositAddress: 'd1' });
    const r2 = await request(app).post('/api/pledges').send({ ...base, satsAmount: 200_000, txid: `t2_${Date.now()}`, depositAddress: 'd2' });

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);

    const ids = [r1.body?.id, r2.body?.id].filter(Boolean);
    expect(ids.length).toBe(2);

    const pledges = await prisma.pledge.findMany({ where: { userId } });
    expect(pledges.length).toBe(2);

    const queued = await getQueuedPledges();
    // At least two entries in queue for this user
    const countForUser = queued.filter((p: any) => p?.userId === userId).length;
    expect(countForUser).toBeGreaterThanOrEqual(2);
  });

  test('rejects 400 when missing required fields (null checks)', async () => {
    await seedUser(`u_${Date.now()}_bad`);
    await seedActiveAuction();

    const { io } = makeIoDouble();
    setSocketServer(io);
    const app = createAppWithRoutes();

    // Missing txid
    const bad = {
      userId: `u_${Date.now()}_bad`,
      satsAmount: 150_000,
      walletDetails: { cardinal: 'tb1', ordinal: 'tb2' },
      // txid missing
    } as any;

    const res = await request(app).post('/api/pledges').send(bad);
    expect(res.status).toBe(400);
    const body = res.body ?? {};
    expect(typeof body.error).toBe('string');
  });
});
