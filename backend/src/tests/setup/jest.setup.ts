// File: backend/src/tests/setup/jest.setup.ts | Purpose: Per-test Jest setup (timeouts, DB/Redis cleanup helpers)
import { redisClient } from '../../config/redis';
import { PrismaClient } from '../../generated/prisma';

jest.setTimeout(60_000);

const prisma = new PrismaClient();

beforeAll(async () => {
  // Ensure connections are reachable
  await redisClient.ping();
  await prisma.$connect();
});

afterAll(async () => {
  // Clean up connections
  try { await prisma.$disconnect(); } catch {}
  try { await redisClient.quit(); } catch {}
});

beforeEach(async () => {
  // Clear Redis keys used by tests
  try {
    const keys = await redisClient.keys('*');
    if (keys.length) {
      await redisClient.del(keys);
    }
  } catch {}

  // Truncate tables to keep tests isolated
  try {
    // Order matters due to FKs
    await prisma.refundedPledge.deleteMany();
    await prisma.pledge.deleteMany();
    await prisma.auction.deleteMany();
    await prisma.user.deleteMany();
  } catch {}
});
