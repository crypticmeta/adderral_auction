import { Request, Response, NextFunction } from 'express';
import prisma from '../../../config/prisma';
import { addHours } from 'date-fns';
import { bitcoinPriceService } from '../../../services/bitcoinPriceService';

// Extend Express Request type to include user property
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// Prisma client provided by singleton

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
export const reseedDb = async (_req: Request, res: Response) => {
  try {
    // Get current BTC price (USD) to derive $1000 target in sats
    let btcUsd = 0;
    try {
      btcUsd = await bitcoinPriceService.getBitcoinPrice();
    } catch (e) {
      // Fallback conservatively to avoid division by zero
      btcUsd = 50000; // safe default; reseed remains functional
    }
    const targetUsd = 1000;
    const targetBtc = targetUsd / btcUsd;
    const targetSats = Math.max(50_000, Math.round(targetBtc * 1e8));
    // Dynamic min/max sats chosen to allow multiple contributors to reach ~$1000 total
    const minPledgeSats = Math.max(50_000, Math.round(targetSats / 20)); // ~5% of target
    const maxPledgeSats = Math.max(minPledgeSats * 4, Math.round(targetSats / 2)); // up to ~50% of target
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
        network: 'mainnet',
      },
    });

    // Test users
    const testUsers = [
      {
        id: 'user-1',
        ordinal_address: 'bc1p5d7tjqlc2kd9czyx7v4d4hq9qk9y0k5j5q6jz8v7q9q6q6q6q6q6q6q6q6',
        pledgeAmount: 0.5,
        cardinal_address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      },
      {
        id: 'user-2',
        ordinal_address: 'bc1p3q6f8z4h5j7k9l0p2q5w8e9r7t6y4u3i2o1p9o8i7u6y5t4r3e2w1q0',
        pledgeAmount: 0.25,
        cardinal_address: 'bc1q9z0t9z5y7x0v9w8z2x3c4v5b6n7m8l9k0j1h2g3f4d5s6f7h8j9k0l1',
      },
      {
        id: 'user-3',
        ordinal_address: 'bc1p0o9i8u7y6t5r4e3w2q1a9s8d7f6g5h4j3k2l1z0x9c8v7b6n5m4l3k2j1',
        pledgeAmount: 0.1,
        cardinal_address: 'bc1q1a2s3d4f5g6h7j8k9l0p1o2i3u4y5t6r7e8w9q0a1s2d3f4g5h6j7k8l9',
      },
    ];

    await Promise.all(
      testUsers.map((u) =>
        prisma.user.create({
          data: {
            id: u.id,
            ordinal_address: u.ordinal_address,
            cardinal_address: u.cardinal_address,
            connected: true,
            network: 'testnet',
          },
        })
      )
    );

    // Create new auction 24h
    const now = new Date();
    const endTime = addHours(now, 24);
    const auction = await prisma.auction.create({
      data: {
        id: '3551190a-c374-4089-a4b0-35912e65ebdd',
        totalTokens: 100000000,
        ceilingMarketCap: targetUsd, // set demo ceiling to $1000
        totalBTCPledged: 0,
        refundedBTC: 0,
        startTime: now,
        endTime,
        isActive: true,
        isCompleted: false,
        minPledgeSats,
        maxPledgeSats,
        network: 'MAINNET',
      },
    });

    // Seed 6–10 pledges totaling around targetSats
    const contributorCount = Math.max(6, Math.min(10, testUsers.length));
    const chosenUsers = testUsers.slice(0, contributorCount);
    // Generate random slices then scale to target
    const randoms = chosenUsers.map(() => Math.random() + 0.5); // 0.5..1.5 range
    const sumRand = randoms.reduce((a, b) => a + b, 0);
    let amounts = randoms.map(r => Math.round((r / sumRand) * targetSats));
    // Clamp within min/max and adjust to approximate targetSats
    amounts = amounts.map(a => Math.min(Math.max(a, minPledgeSats), maxPledgeSats));
    // If sum deviates, adjust last entry within bounds
    let sumNow = amounts.reduce((a, b) => a + b, 0);
    const delta = targetSats - sumNow;
    if (delta !== 0) {
      const lastIdx = amounts.length - 1;
      const adjusted = Math.min(Math.max(amounts[lastIdx] + delta, minPledgeSats), maxPledgeSats);
      sumNow += (adjusted - amounts[lastIdx]);
      amounts[lastIdx] = adjusted;
    }

    for (let i = 0; i < chosenUsers.length; i++) {
      const u = chosenUsers[i];
      await prisma.pledge.create({
        data: {
          userId: u.id,
          auctionId: auction.id,
          satAmount: amounts[i],
          depositAddress: 'generated-deposit-address',
          status: 'confirmed',
          verified: true,
          network: 'MAINNET'
        },
      });
    }

    const totalPledgedBtc = amounts.reduce((s, a) => s + a, 0) / 1e8;
    await prisma.auction.update({
      where: { id: auction.id },
      data: { totalBTCPledged: totalPledgedBtc },
    });

    return res.status(200).json({
      message: 'Database wiped and reseeded successfully',
      adminId: admin.id,
      auctionId: auction.id,
      targetUsd,
      btcUsd,
      minPledgeSats,
      maxPledgeSats,
      totalPledgedBTC: totalPledgedBtc,
      endTime,
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
      where: { isActive: true }
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

