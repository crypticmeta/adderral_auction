// File: backend/src/tests/setup/jest.setup.ts | Purpose: Per-test Jest setup (timeouts, DB/Redis cleanup helpers)
import prisma from '../../config/prisma';
import redisClient from '../../config/redis';
import { setLogLevel } from '../../utils/logger';
import { stopBitcoinPriceRefresh, stopTxConfirmationChecks } from '../../services/scheduledTasks';

jest.setTimeout(60_000);

// Keep logs fully silent during tests unless explicitly overridden
setLogLevel((process.env.LOG_LEVEL as any) || 'silent');

// Patch console ASAP (module scope) to affect import-time logs (e.g., dotenv)
const skipPrefixes = ['[dotenv@'];
const collapse = (args: any[]) =>
  args
    .map((a) => (typeof a === 'string' ? a.replace(/\n{2,}/g, '\n').trimEnd() : a))
    .filter((a) => {
      if (typeof a !== 'string') return true;
      if (!a.trim()) return false; // drop empty-only lines
      if (skipPrefixes.some((p) => a.startsWith(p))) return false;
      return true;
    });
const orig = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
};
console.log = (...args: any[]) => {
  const pruned = collapse(args);
  if (pruned.length === 0) return; // avoid printing 'undefined'
  return orig.log.apply(console, pruned);
};
console.info = (...args: any[]) => {
  const pruned = collapse(args);
  if (pruned.length === 0) return;
  return orig.info.apply(console, pruned);
};
console.warn = (...args: any[]) => {
  const pruned = collapse(args);
  if (pruned.length === 0) return;
  return orig.warn.apply(console, pruned);
};
console.error = (...args: any[]) => {
  const pruned = collapse(args);
  if (pruned.length === 0) return;
  return orig.error.apply(console, pruned);
};

beforeAll(async () => {
  // Ensure connections are reachable
  await redisClient.ping();
  await prisma.$connect();
});

afterAll(async () => {
  // Clean up connections
  try { stopBitcoinPriceRefresh(); } catch {}
  try { stopTxConfirmationChecks(); } catch {}
  // Ensure Redis DB is emptied at the end of test run
  try { await redisClient.flushdb(); } catch {}
  try { await redisClient.quit(); } catch {}
  try { redisClient.disconnect(); } catch {}
  try { await prisma.$disconnect(); } catch {}
});

beforeEach(async () => {
  // Clear entire Redis DB to keep tests isolated
  try { await redisClient.flushdb(); } catch {}

  // Truncate tables to keep tests isolated
  try {
    // Order matters due to FKs
    await prisma.refundedPledge.deleteMany();
    await prisma.pledge.deleteMany();
    await prisma.auction.deleteMany();
    await prisma.user.deleteMany();
  } catch {}
});
