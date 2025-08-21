// File: backend/src/tests/utils/testFactories.ts | Purpose: Shared test factories (e.g., createActiveAuction) with sensible defaults and null-safety
import prisma from '../../config/prisma';

export async function createActiveAuction(
  overrides: Record<string, any> = {}
) {
  const now = new Date();
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Defaults with safe numeric ranges; allow overrides
  const data: Record<string, any> = {
    totalTokens: 50000,
    ceilingMarketCap: 250000,
    totalBTCPledged: 0,
    refundedBTC: 0,
    startTime: now,
    endTime: end,
    isActive: true,
    isCompleted: false,
    minPledgeSats: 20000,
    maxPledgeSats: 400000,
    network: 'MAINNET',
    ...overrides,
  };

  // Null checks for critical fields (defensive)
  if (!data.startTime) data.startTime = now;
  if (!data.endTime) data.endTime = end;
  if (data.minPledgeSats != null && data.maxPledgeSats != null) {
    if (data.minPledgeSats > data.maxPledgeSats) {
      const tmp = data.minPledgeSats;
      data.minPledgeSats = data.maxPledgeSats;
      data.maxPledgeSats = tmp;
    }
  }

  // Cast for test-only context to satisfy TS on generated Prisma input types
  const created = await prisma.auction.create({ data: data as any });
  return created;
}
