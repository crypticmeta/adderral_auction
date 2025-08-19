import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '../../../generated/prisma';
import jwt from 'jsonwebtoken';

// Extend Express Request type to include user property
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

const prisma = new PrismaClient();

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

