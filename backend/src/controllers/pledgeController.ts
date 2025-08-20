/**
 * Pledge controller
 * Handles pledge creation, verification, and retrieval for the auction system
 */

import { Request, Response } from 'express';
import { PrismaClient } from '../generated/prisma';
import { Server } from 'socket.io';
import { PledgeQueueService } from '../services/pledgeQueueService';
import { BitcoinPriceService } from '../services/bitcoinPriceService';
import { broadcastPledgeCreated, broadcastPledgeVerified } from '../websocket/socketHandler';
import { PledgeType } from '../types';

// Initialize Prisma client
const prisma = new PrismaClient();

// Get PledgeQueueService instance
const pledgeQueueService = PledgeQueueService.getInstance();

// Socket.io server instance
let io: Server | null = null;

// Set the Socket.IO server instance
export const setSocketServer = (socketServer: Server) => {
  io = socketServer;
  pledgeQueueService.setSocketServer(socketServer);
};

/**
 * Get pledge totals for the last 24/48/72 hours (public)
 * Summarizes total BTC pledged by time window. If an active auction exists, scopes to that auction; otherwise sums across all.
 */
export const getPledgeStats = async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const t24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const t48 = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const t72 = new Date(now.getTime() - 72 * 60 * 60 * 1000);

    // Try to scope to active auction when available
    const activeAuction = await prisma.auction.findFirst({ where: { isActive: true } });
    const auctionWhere = activeAuction ? { auctionId: activeAuction.id } : {};

    // Independent 24h windows: [now-24h, now), [now-48h, now-24h), [now-72h, now-48h)
    const [sum0to24, sum24to48, sum48to72] = await Promise.all([
      prisma.pledge.aggregate({ _sum: { satAmount: true }, where: { ...auctionWhere, timestamp: { gte: t24, lt: now } } }),
      prisma.pledge.aggregate({ _sum: { satAmount: true }, where: { ...auctionWhere, timestamp: { gte: t48, lt: t24 } } }),
      prisma.pledge.aggregate({ _sum: { satAmount: true }, where: { ...auctionWhere, timestamp: { gte: t72, lt: t48 } } }),
    ]);

    return res.status(200).json({
      scope: activeAuction ? { type: 'active_auction', auctionId: activeAuction.id } : { type: 'all' },
      totals: {
        // return BTC for display
        last24h: ((sum0to24._sum?.satAmount ?? 0) as number) / 1e8,
        last48h: ((sum24to48._sum?.satAmount ?? 0) as number) / 1e8,
        last72h: ((sum48to72._sum?.satAmount ?? 0) as number) / 1e8,
      },
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error('Error getting pledge stats:', error);
    return res.status(500).json({
      error: 'Failed to get pledge stats',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Calculate the maximum pledge amount for an auction (internal helper)
 */
const calculateMaxPledgeInternal = async (auction: any): Promise<number> => {
  const minBTC = ((auction?.minPledgeSats ?? 0) as number) / 1e8;
  const maxBTC = ((auction?.maxPledgeSats ?? 0) as number) / 1e8;
  return pledgeQueueService.calculateMaxPledgeAmount(
    auction.id,
    minBTC,
    maxBTC,
    auction.ceilingMarketCap,
    auction.totalBTCPledged
  );
};

/**
 * Create a new pledge
 */
export const createPledge = async (req: Request, res: Response) => {
  try {
    const { userId, btcAmount, walletInfo, signature } = req.body;

    if (!userId || !btcAmount || !walletInfo || !signature) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate the user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get active auction
    const auction = await prisma.auction.findFirst({
      where: { isActive: true }
    });

    if (!auction) {
      return res.status(404).json({ error: 'No active auction found' });
    }

    // Validate pledge amount (compare in BTC, source of truth in sats)
    const maxPledge = await calculateMaxPledgeInternal(auction);
    const minBTC = ((auction?.minPledgeSats ?? 0) as number) / 1e8;
    if (Number(btcAmount) < minBTC || Number(btcAmount) > maxPledge) {
      return res.status(400).json({
        error: `Pledge amount must be between ${minBTC} and ${maxPledge} BTC`
      });
    }
    
    // Create a deposit address (in a real implementation, this would generate a unique address)
    const depositAddress = `btc_deposit_${Date.now().toString(16)}`;

    // Create the pledge in the database
    const pledge = await prisma.pledge.create({
      data: {
        userId,
        // store in sats
        satAmount: Math.round(Number(btcAmount) * 1e8),
        auctionId: auction.id,
        depositAddress,
        signature,
        cardinal_address: walletInfo?.address ?? null,
        ordinal_address: depositAddress,
        // inherit network from auction to route mempool queries correctly
        network: auction.network,
        processed: false,
        needsRefund: false
      },
      include: {
        user: true
      }
    });
    
    // Add pledge to Redis queue with precise timestamp for FCFS ordering
    await pledgeQueueService.enqueuePledge({
      id: pledge.id,
      userId: pledge.userId,
      btcAmount: (pledge.satAmount ?? 0) / 1e8,
      auctionId: pledge.auctionId,
      timestamp: pledge.timestamp.toISOString(),
      sender: pledge.cardinal_address || '',
      depositAddress: pledge.depositAddress || '',
      signature: pledge.signature
    });
    
    // Get pledge position in queue
    const queuePosition = await pledgeQueueService.getPledgePosition(pledge.id);
    
    // We don't update the auction's total BTC pledged here anymore
    // It will be updated when the pledge is processed from the queue

    // Broadcast the pledge creation event
    if (io) {
      broadcastPledgeCreated(io, pledge as any);
      // Also broadcast queue position separately
      io.emit('pledge:queue:position', { pledgeId: pledge.id, position: queuePosition });
    }

    return res.status(201).json({
      ...pledge,
      queuePosition
    });
  } catch (error) {
    console.error('Error creating pledge:', error);
    return res.status(500).json({
      error: 'Failed to create pledge',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Verify a pledge with a transaction ID
 */
export const verifyPledge = async (req: Request, res: Response) => {
  try {
    const { pledgeId, txid } = req.body;

    if (!pledgeId || !txid) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find the pledge
    const pledge = await prisma.pledge.findUnique({
      where: { id: pledgeId },
      include: { user: true }
    });

    if (!pledge) {
      return res.status(404).json({ error: 'Pledge not found' });
    }

    if (pledge.verified) {
      return res.status(400).json({ error: 'Pledge is already verified' });
    }

    // In a real implementation, we would verify the transaction with a Bitcoin node
    // For now, we'll just simulate verification
    const transaction = {
      txid,
      fee: 0.0001,
      confirmations: 1,
      status: 'confirmed'
    };

    // Update the pledge with the transaction details
    const updatedPledge = await prisma.pledge.update({
      where: { id: pledgeId },
      data: {
        txid,
        fee: transaction.fee,
        confirmations: transaction.confirmations,
        status: transaction.status,
        verified: transaction.status === 'confirmed'
      },
      include: {
        user: true
      }
    });

    // Broadcast the pledge verification event
    if (io) {
      broadcastPledgeVerified(io, updatedPledge);
    }

    return res.status(200).json(updatedPledge);
  } catch (error) {
    console.error('Error verifying pledge:', error);
    return res.status(500).json({
      error: 'Failed to verify pledge',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get all pledges for an auction
 */
export const getPledges = async (req: Request, res: Response) => {
  try {
    const { auctionId } = req.params;

    if (!auctionId) {
      return res.status(400).json({ error: 'Auction ID is required' });
    }

    // Get only UNCONFIRMED (not verified) pledges for this auction, oldest first
    const pledges = await prisma.pledge.findMany({
      where: { auctionId, verified: false },
      orderBy: { timestamp: 'asc' },
      include: {
        user: {
          select: {
            cardinal_address: true,
            ordinal_address: true,
          }
        }
      }
    });
    
    // Enrich pledges with queue position, processed status, and refund status
    const enrichedPledges = await Promise.all(pledges.map(async (pledge) => {
      const position = await pledgeQueueService.getPledgePosition(pledge.id);
      const { processed, needsRefund } = await pledgeQueueService.getPledgeProcessedStatus(pledge.id);
      return {
        ...pledge,
        queuePosition: position,
        processed,
        needsRefund
      };
    }));

    return res.status(200).json(enrichedPledges);
  } catch (error) {
    console.error('Error getting pledges:', error);
    return res.status(500).json({
      error: 'Failed to get pledges',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get pledges for a specific user in an auction
 */
export const getUserPledges = async (req: Request, res: Response) => {
  try {
    const { userId, auctionId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    if (!auctionId) {
      return res.status(400).json({ error: 'Auction ID is required' });
    }

    // Get all pledges for this user ordered by timestamp (oldest first for FCFS)
    const pledges = await prisma.pledge.findMany({
      where: {
        userId,
        auctionId
      },
      orderBy: { timestamp: 'asc' }
    });
    
    // Enrich pledges with queue position, processed status, and refund status
    const enrichedPledges = await Promise.all(pledges.map(async (pledge) => {
      const position = await pledgeQueueService.getPledgePosition(pledge.id);
      const { processed, needsRefund } = await pledgeQueueService.getPledgeProcessedStatus(pledge.id);
      return {
        ...pledge,
        queuePosition: position,
        processed,
        needsRefund
      };
    }));

    return res.status(200).json(enrichedPledges);
  } catch (error) {
    console.error('Error getting user pledges:', error);
    return res.status(500).json({
      error: 'Failed to get user pledges',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Calculate maximum pledge amount to avoid hitting ceiling
 */
export const calculateMaxPledge = async (req: Request, res: Response) => {
  try {
    const { auctionId } = req.params;
    
    if (!auctionId) {
      return res.status(400).json({ error: 'Auction ID is required' });
    }
    
    // Get auction details
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId }
    });
    
    if (!auction) {
      return res.status(404).json({ error: 'Auction not found' });
    }
    
    // Calculate max pledge amount (use sats fields converted to BTC)
    const minBTC = ((auction?.minPledgeSats ?? 0) as number) / 1e8;
    const maxBTC = ((auction?.maxPledgeSats ?? 0) as number) / 1e8;
    const maxAmount = await pledgeQueueService.calculateMaxPledgeAmount(
      auctionId,
      minBTC,
      maxBTC,
      auction.ceilingMarketCap,
      auction.totalBTCPledged
    );
    
    // Get current BTC price
    const btcPriceService = BitcoinPriceService.getInstance();
    const btcPrice = await btcPriceService.getBitcoinPrice();
    
    return res.status(200).json({
      minPledge: minBTC,
      maxPledge: maxAmount, // calculated max in BTC
      currentBTCPrice: btcPrice,
      minPledgeUSD: minBTC * btcPrice,
      maxPledgeUSD: maxAmount * btcPrice
    });
  } catch (error) {
    console.error('Error calculating max pledge:', error);
    return res.status(500).json({
      error: 'Failed to calculate max pledge',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Process the next pledge in the queue
 */
export const processNextPledge = async (req: Request, res: Response) => {
  try {
    const { auctionId } = req.params;
    
    if (!auctionId) {
      return res.status(400).json({ error: 'Auction ID is required' });
    }
    
    // Get auction details
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId }
    });
    
    if (!auction) {
      return res.status(404).json({ error: 'Auction not found' });
    }
    
    // Process the next pledge
    const pledge = await pledgeQueueService.processNextPledge(
      auction.ceilingMarketCap,
      auction.totalBTCPledged
    );
    
    if (!pledge) {
      return res.status(404).json({ error: 'No pledges in queue' });
    }
    
    // If the pledge doesn't need a refund, update the auction's total BTC pledged
    if (!pledge.needsRefund) {
      await prisma.auction.update({
        where: { id: auctionId },
        data: {
          totalBTCPledged: {
            increment: pledge.btcAmount
          }
        }
      });
    }
    
    // Update the pledge in the database with processed status and refund flag
    await prisma.pledge.update({
      where: { id: pledge.id },
      data: {
        processed: true,
        needsRefund: pledge.needsRefund || false
      }
    });
    
    // Broadcast pledge processed event
    if (io) {
      io.emit('pledge:processed', { 
        pledgeId: pledge.id, 
        needsRefund: pledge.needsRefund || false 
      });
    }
    
    return res.status(200).json({
      ...pledge,
      processed: true
    });
  } catch (error) {
    console.error('Error processing next pledge:', error);
    return res.status(500).json({
      error: 'Failed to process next pledge',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
