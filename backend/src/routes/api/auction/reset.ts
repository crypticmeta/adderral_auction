// File: backend/src/routes/api/auction/reset.ts
// Purpose: Dev-only admin endpoints to reset or reseed the database.
// - POST /api/auction/reset: clears pledges for the active auction and restarts a fresh window (72h from now).
// - POST /api/auction/reseed[?mode=test|prod]: full DB wipe + reseed.
//   - mode=test (default): seeds admin, sample users, a 24h demo auction, and sample pledges.
//   - mode=prod: seeds admin and a production-style auction only (no sample users/pledges),
//                starting at 29 Aug 13:00 UTC (current year) with 72h duration.
import { Request, Response, NextFunction } from 'express';
import prisma from '../../../config/prisma';
import { addHours } from 'date-fns';
import config from '../../../config/config';

// Extend Express Request type to include user property
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// Prisma client provided by singleton

// Helper: map env network to Prisma enum
const toEnumNetwork = (n: string | null | undefined) =>
  (String(n).toLowerCase() === 'testnet' ? 'TESTNET' : 'MAINNET');

// Middleware to verify admin access
/**
 * Simple middleware for dev mode only - allows reset functionality
 * This will be disabled in production
 */
export const verifyAdminAccess = async (req: Request, res: Response, next: NextFunction) => {
  // Check if we're in development mode
  const isDev = process.env.NODE_ENV !== 'production';
  
  if (!isDev) {
    return res.status(403).json({ message: 'Reset functionality is disabled in production mode' });
  }
  
  // In dev mode, allow the reset without complex authentication
  next();
};

/**
 * Full DB wipe + reseed (dev only)
 * - Truncates Pledge, Auction, User
 * - Seeds admin, test users, one active auction, and sample pledges
 */
export const reseedDb = async (req: Request, res: Response) => {
  try {
    // Optional mode: 'test' (default) or 'prod'
    const mode = String((req.query?.mode ?? 'test')).toLowerCase();
    const isProd = mode === 'prod';

    // Params aligned with prisma/seed.ts
    let minPledgeSats = 100_000; // prod defaults
    let maxPledgeSats = 50_000_000;
    let ceilingUsd = 15_000_000; // prod ceiling
    let totalTokens = 1_000_000_000;
    let tokensOnSale = 100_000_000;

    if (!isProd) {
      // Test/dev overrides
      minPledgeSats = 10_000;
      maxPledgeSats = 200_000;
      ceilingUsd = 5_000;
      totalTokens = 100_000;
      tokensOnSale = 10_000;
    }
    // Truncate all core tables
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Pledge" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Auction" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');

    // Create admin
    const admin = await prisma.user.create({
      data: {
        id: 'admin',
        ordinal_address: 'bc1pkddf9em6k82spy0ysxdqp5t5puuwdkn6prhcqvhf6vf8tcc686lq4uy0ca',
        connected: true,
        network: String(config.btcNetwork || 'mainnet').toLowerCase(),
      },
    });

    // No test users are created; only admin is seeded to match production/test parity

    // Create new auction window
    let startTime = new Date();
    if (isProd) {
      const currentYear = new Date().getUTCFullYear();
      startTime = new Date(Date.UTC(currentYear, 7, 29, 13, 0, 0)); // Aug=7 (0-based), 13:00 UTC
    }
    const endTime = addHours(startTime, isProd ? 72 : 24);
    const auction = await prisma.auction.create({
      data: {
        id: '3551190a-c374-4089-a4b0-35912e65ebdd',
        totalTokens,
        tokensOnSale,
        ceilingMarketCap: ceilingUsd,
        totalBTCPledged: 0,
        refundedBTC: 0,
        startTime,
        endTime,
        isActive: true,
        isCompleted: false,
        minPledgeSats,
        maxPledgeSats,
        network: toEnumNetwork(config.btcNetwork),
      },
    });

    // No pledges are seeded. Keep totalPledgedBtc = 0.
    let totalPledgedBtc = 0;

    return res.status(200).json({
      message: 'Database wiped and reseeded successfully',
      adminId: admin.id,
      auctionId: auction.id,
      ceilingUsd,
      minPledgeSats,
      maxPledgeSats,
      totalPledgedBTC: totalPledgedBtc,
      endTime,
      startTime,
      mode: isProd ? 'prod' : 'test',
    });
  } catch (error) {
    console.error('Error reseeding DB:', error);
    return res.status(500).json({
      message: 'Failed to reseed database',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Reset the auction - clear all pledges and restart with a new duration
 */
export const resetAuction = async (req: Request, res: Response) => {
  try {
    // Get the current auction
    const currentAuction = await prisma.auction.findFirst({
      where: { isActive: true, network: toEnumNetwork(config.btcNetwork) }
    });

    if (!currentAuction) {
      return res.status(404).json({ message: 'No active auction found' });
    }

    // Calculate new end time (72 hours from now)
    const newEndTime = new Date();
    newEndTime.setHours(newEndTime.getHours() + 72);

    // Transaction to delete all pledges and reset the auction
    await prisma.$transaction([
      // Delete all pledges for the current auction
      prisma.pledge.deleteMany({
        where: { auctionId: currentAuction.id }
      }),
      // Reset the auction
      prisma.auction.update({
        where: { id: currentAuction.id },
        data: {
          totalBTCPledged: 0,
          startTime: new Date(),
          endTime: newEndTime,
          isCompleted: false,
          isActive: true
        }
      })
    ]);

    return res.status(200).json({ 
      message: 'Auction reset successfully',
      newEndTime
    });
  } catch (error) {
    console.error('Error resetting auction:', error);
    return res.status(500).json({ 
      message: 'Failed to reset auction', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

