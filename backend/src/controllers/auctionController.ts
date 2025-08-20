/**
 * Auction controller
 * Manages auction lifecycle, wallet connections, pledges, and auction statistics
 */

import { Request, Response } from 'express';
import { PrismaClient } from '../generated/prisma';
import { Server } from 'socket.io';
import { AuctionType, MultiWalletData } from '../types';
import { BitcoinWalletService } from '../services/bitcoinWalletService';
import { bitcoinPriceService } from '../services/bitcoinPriceService';
import { redisClient } from '../config/redis';
import { addHours } from 'date-fns';

const prisma = new PrismaClient();
const bitcoinWalletService = BitcoinWalletService.getInstance();

// Store the Socket.IO server instance
let io: Server;

// Set the Socket.IO server instance
export const setSocketServer = (socketServer: Server) => {
  io = socketServer;
};

// Calculate current market cap based on BTC raised and current BTC price
const calculateCurrentMarketCap = async (totalBTCPledged: number): Promise<number> => {
  // Get current BTC price from service
  const btcPrice = await bitcoinPriceService.getBitcoinPrice();
  return totalBTCPledged * btcPrice;
};

// Helper function to check if auction should end due to time limit
const checkAuctionTimeLimit = async (auction: any): Promise<boolean> => {
  if (!auction.isActive || auction.isCompleted) {
    return false;
  }
  
  const now = new Date();
  const endTime = new Date(auction.endTime);
  
  // Check if 72 hours have passed since start time
  if (now >= endTime) {
    // Update auction to completed state
    await prisma.auction.update({
      where: { id: auction.id },
      data: {
        isActive: false,
        isCompleted: true
      }
    });
    
    console.log(`Auction ${auction.id} completed due to reaching 72-hour time limit`);
    return true;
  }
  
  return false;
};

// Helper function to broadcast auction updates
export const broadcastAuctionUpdate = async (auctionId: string) => {
  try {
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        pledges: {
          include: {
            user: true
          }
        },
        refundedPledges: {
          include: {
            user: true
          }
        }
      }
    });
    
    if (auction) {
      // Calculate current market cap using real-time BTC price
      const currentMarketCap = await calculateCurrentMarketCap(auction.totalBTCPledged);
      const ceilingReached = currentMarketCap >= auction.ceilingMarketCap;
      
      // Check if auction should end due to time limit
      const timeExpired = await checkAuctionTimeLimit(auction);
      
      // If ceiling reached and auction is still active, complete it
      if (ceilingReached && auction.isActive && !auction.isCompleted) {
        await prisma.auction.update({
          where: { id: auction.id },
          data: {
            isActive: false,
            isCompleted: true
          }
        });
        console.log(`Auction ${auction.id} completed due to reaching ceiling market cap`);
      }
      
      // Store auction data in Redis for quick access
      await redisClient.set(`auction:${auctionId}`, JSON.stringify(auction));
      
      // Broadcast to all clients in the auction room
      io.to(`auction:${auctionId}`).emit('auction:update', {
        id: auction.id,
        totalTokens: auction.totalTokens,
        totalBTCPledged: auction.totalBTCPledged,
        ceilingMarketCap: auction.ceilingMarketCap,
        currentMarketCap,
        ceilingReached,
        startTime: auction.startTime,
        endTime: auction.endTime,
        isActive: auction.isActive,
        isCompleted: auction.isCompleted,
        pledgeCount: auction.pledges.length,
        refundedPledgeCount: auction.refundedPledges.length,
        refundedBTC: auction.refundedBTC
      });
    }
  } catch (error) {
    console.error('Error broadcasting auction update:', error);
  }
};

// Create a new auction
export const createAuction = async (req: Request, res: Response) => {
  try {
    const { totalTokens, ceilingMarketCap, startTime, endTime, minPledgeSats, maxPledgeSats } = req.body;
    
    if (!totalTokens || !ceilingMarketCap || !startTime || !endTime) {
      return res.status(400).json({ message: 'Missing required auction fields' });
    }
    
    const auction = await prisma.auction.create({
      data: {
        totalTokens: parseFloat(totalTokens),
        ceilingMarketCap: parseFloat(ceilingMarketCap), // Using ceiling market cap instead of hardCapBTC
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        // sats fields (fallbacks: 0.001 BTC and 0.5 BTC)
        minPledgeSats: minPledgeSats ? Number(minPledgeSats) : 100_000,
        maxPledgeSats: maxPledgeSats ? Number(maxPledgeSats) : 50_000_000,
        isActive: true,
        isCompleted: false,
        totalBTCPledged: 0,
        refundedBTC: 0 // Track refunded BTC amounts
      }
    });
    
    // Broadcast the new auction
    await broadcastAuctionUpdate(auction.id);
    
    res.status(201).json(auction);
  } catch (error) {
    console.error('Create auction error:', error);
    res.status(500).json({ message: 'Server error creating auction' });
  }
};

// Get auction by ID
export const getAuction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Try to get from Redis first for better performance
    const cachedAuction = await redisClient.get(`auction:${id}`);
    if (cachedAuction) {
      return res.status(200).json(JSON.parse(cachedAuction));
    }
    
    const auction = await prisma.auction.findUnique({
      where: { id },
      include: {
        pledges: {
          include: {
            user: {
              select: {
                id: true,
                cardinal_address: true,
                ordinal_address: true,
                cardinal_pubkey: true,
                network: true
              }
            }
          }
        }
      }
    });
    
    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }
    
    // Cache the result in Redis
    await redisClient.set(`auction:${id}`, JSON.stringify(auction));
    
    res.status(200).json(auction);
  } catch (error) {
    console.error('Get auction error:', error);
    res.status(500).json({ message: 'Server error retrieving auction' });
  }
};

// Get all auctions
export const getAllAuctions = async (req: Request, res: Response) => {
  try {
    const auctions = await prisma.auction.findMany({
      orderBy: { startTime: 'desc' }
    });
    
    res.status(200).json(auctions);
  } catch (error) {
    console.error('Get all auctions error:', error);
    res.status(500).json({ message: 'Server error retrieving auctions' });
  }
};

// Update auction status
export const updateAuctionStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive, isCompleted } = req.body;
    
    if (isActive === undefined && isCompleted === undefined) {
      return res.status(400).json({ message: 'Either isActive or isCompleted must be provided' });
    }
    
    const auction = await prisma.auction.update({
      where: { id },
      data: { 
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
        isCompleted: isCompleted !== undefined ? Boolean(isCompleted) : undefined
      }
    });
    
    // Broadcast the status update
    await broadcastAuctionUpdate(auction.id);
    
    res.status(200).json(auction);
  } catch (error) {
    console.error('Update auction status error:', error);
    res.status(500).json({ message: 'Server error updating auction status' });
  }
};

// Using MultiWalletData from centralized types

// Connect wallet
export const connectWallet = async (req: Request, res: Response) => {
  try {
    const { userId, btcAddress, network, publicKey, signature } = req.body;
    
    if (!userId || !btcAddress || !publicKey) {
      return res.status(400).json({ message: 'User ID, BTC address, and public key are required' });
    }
    
    // Verify wallet ownership (in a real implementation, this would verify the signature)
    const message = 'Verify wallet ownership for Adderrels Auction';
    const isWalletVerified = await bitcoinWalletService.verifyWalletOwnership(
      btcAddress,
      signature || '',
      message
    );
    
    if (!isWalletVerified) {
      return res.status(400).json({ message: 'Wallet ownership verification failed' });
    }
    
    // Update user with wallet info
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        cardinal_address: btcAddress,
        cardinal_pubkey: publicKey,
        network: network || 'mainnet',
        connected: true
      },
      select: {
        id: true,
        cardinal_address: true,
        cardinal_pubkey: true,
        network: true
      }
    });
    
    res.status(200).json({
      id: user.id,
      cardinal_address: user.cardinal_address,
      cardinal_pubkey: user.cardinal_pubkey,
      network: user.network
    });
  } catch (error) {
    console.error('Connect wallet error:', error);
    res.status(500).json({ message: 'Server error connecting wallet' });
  }
};

// Connect multi-wallet
export const connectMultiWallet = async (req: Request, res: Response) => {
  try {
    const { userId, btcAddress, taprootAddress, network, publicKey, signature } = req.body as MultiWalletData;
    
    // Validate required fields
    if (!userId || !btcAddress || !taprootAddress || !publicKey) {
      return res.status(400).json({ 
        message: 'User ID, BTC address, Taproot address, and public key are required' 
      });
    }
    
    // Verify wallet ownership
    const message = 'Verify multi-wallet ownership for Adderrels Auction';
    const isWalletVerified = await bitcoinWalletService.verifyWalletOwnership(
      btcAddress,
      signature || '',
      message
    );
    
    if (!isWalletVerified) {
      return res.status(400).json({ message: 'Multi-wallet ownership verification failed' });
    }
    
    // Update user with wallet info if not already connected
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        cardinal_address: true,
        ordinal_address: true,
        cardinal_pubkey: true,
        wallet: true,
        network: true,
        connected: true,
      },
    });
    
    if (user && !user.cardinal_address) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          cardinal_address: btcAddress,
          ordinal_address: taprootAddress,
          cardinal_pubkey: publicKey,
          wallet: 'multi',
          network,
          connected: true,
        },
      });
    }
    
    // Return updated user data
    if (user) {
      res.status(200).json({
        id: user.id,
        cardinal_address: user.cardinal_address,
        ordinal_address: user.ordinal_address,
        cardinal_pubkey: user.cardinal_pubkey,
        wallet: user.wallet,
        network: user.network
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Connect multi-wallet error:', error);
    res.status(500).json({ message: 'Server error connecting multi-wallet' });
  }
};

// Get auction pledges
export const getAuctionPledges = async (req: Request, res: Response) => {
  try {
    const { auctionId } = req.params;
    
    const pledges = await prisma.pledge.findMany({
      where: { auctionId },
      include: {
        user: {
          select: {
            id: true,
            cardinal_address: true,
            ordinal_address: true,
            cardinal_pubkey: true,
            ordinal_pubkey: true,
            wallet: true,
            network: true
          }
        }
      },
      orderBy: { timestamp: 'desc' }
    });
    
    res.status(200).json(pledges);
  } catch (error) {
    console.error('Get auction pledges error:', error);
    res.status(500).json({ message: 'Server error retrieving pledges' });
  }
};

// Calculate user allocation based on their verified pledges
export const getUserAllocation = async (req: Request, res: Response) => {
  try {
    const { userId, auctionId } = req.params;
    
    // Get all verified pledges for this user in this auction
    const userPledges = await prisma.pledge.findMany({
      where: {
        userId,
        auctionId,
        confirmations: {
          gte: 1 // Consider pledges with at least 1 confirmation as verified
        }
      }
    });
    
    // Get any refunded pledges for this user
    const userRefundedPledges = await prisma.refundedPledge.findMany({
      where: {
        userId,
        auctionId
      }
    });
    
    // Get the auction details
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId }
    });
    
    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }
    
    // Calculate total verified pledges for this auction
    const totalVerifiedPledges = await prisma.pledge.aggregate({
      where: {
        auctionId,
        confirmations: {
          gte: 1
        }
      },
      _sum: {
        satAmount: true
      }
    });
    
    const totalRaised = ((totalVerifiedPledges._sum?.satAmount ?? 0) as number) / 1e8;
    
    // Calculate user's total contribution
    const userTotal = userPledges.reduce((sum, pledge: any) => sum + (((pledge?.satAmount ?? 0) as number) / 1e8), 0);
    
    // Calculate user's refunded amount
    const userRefundedTotal = userRefundedPledges.reduce((sum, pledge) => sum + pledge.btcAmount, 0);
    
    // Calculate token allocation based on BTC contribution and current BTC price
    const currentMarketCap = await calculateCurrentMarketCap(totalRaised);
    const tokenPrice = currentMarketCap / auction.totalTokens;
    const btcPrice = await bitcoinPriceService.getBitcoinPrice();
    const tokenAllocation = userTotal * btcPrice / tokenPrice;
    
    // Calculate allocation percentage
    const allocationPercentage = totalRaised > 0 ? (userTotal / totalRaised) * 100 : 0;
    
    res.status(200).json({
      userId,
      auctionId,
      userTotal,
      totalRaised,
      allocationPercentage,
      pledgeCount: userPledges.length,
      refundedPledgeCount: userRefundedPledges.length,
      refundedTotal: userRefundedTotal,
      tokenAllocation,
      hasRefunds: userRefundedPledges.length > 0
    });
  } catch (error) {
    console.error('Get user allocation error:', error);
    res.status(500).json({ message: 'Server error calculating allocation' });
  }
};

// Get auction statistics
export const getAuctionStats = async (req: Request, res: Response) => {
  try {
    const { auctionId } = req.params;
    
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        refundedPledges: true
      }
    });
    
    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }
    
    // Get pledge statistics
    const pledgeStats = await prisma.pledge.aggregate({
      where: { auctionId },
      _count: true,
      _sum: { satAmount: true },
      _avg: { satAmount: true },
      _max: { satAmount: true },
      _min: { satAmount: true }
    });
    
    // Get refunded pledge statistics
    const refundedPledgeStats = await prisma.refundedPledge.aggregate({
      where: { auctionId },
      _count: true,
      _sum: { btcAmount: true }
    });
    
    // Get unique participants count
    const uniqueParticipants = await prisma.pledge.groupBy({
      by: ['userId'],
      where: { auctionId },
      _count: true
    });
    
    // Calculate current market cap using real-time BTC price
    const currentMarketCap = await calculateCurrentMarketCap(auction.totalBTCPledged);
    const ceilingReached = currentMarketCap >= auction.ceilingMarketCap;
    
    const stats = {
      auctionId,
      totalTokens: auction.totalTokens,
      isActive: auction.isActive,
      isCompleted: auction.isCompleted,
      ceilingMarketCap: auction.ceilingMarketCap,
      currentMarketCap,
      ceilingReached,
      totalBTCPledged: ((pledgeStats._sum?.satAmount ?? 0) as number) / 1e8,
      percentageFilled: auction.ceilingMarketCap > 0 ? 
        (currentMarketCap / auction.ceilingMarketCap) * 100 : 0,
      pledgeCount: pledgeStats._count,
      averagePledge: ((pledgeStats._avg?.satAmount ?? 0) as number) / 1e8,
      largestPledge: ((pledgeStats._max?.satAmount ?? 0) as number) / 1e8,
      smallestPledge: ((pledgeStats._min?.satAmount ?? 0) as number) / 1e8,
      uniqueParticipants: uniqueParticipants.length,
      refundedPledgeCount: refundedPledgeStats._count,
      refundedBTC: refundedPledgeStats._sum?.btcAmount || 0,
      startTime: auction.startTime,
      endTime: auction.endTime,
      timeRemaining: new Date(auction.endTime).getTime() - Date.now()
    };
    
    // Cache the stats in Redis
    await redisClient.set(`auction:${auctionId}:stats`, JSON.stringify(stats), 'EX', 60); // Expire after 60 seconds
    
    res.status(200).json(stats);
  } catch (error) {
    console.error('Get auction stats error:', error);
    res.status(500).json({ message: 'Server error retrieving auction statistics' });
  }
};

// Reset auction to initial state
export const resetAuction = async (req: Request, res: Response) => {
  try {
    // 1) Purge Redis caches related to auctions/stats
    try {
      const keys = await redisClient.keys('auction:*');
      if (keys && keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (e) {
      console.warn('Warning: Failed to purge Redis keys', e);
    }

    // 2) Fully reset DB: truncate core tables (CASCADE ensures FKs are handled)
    //    Note: Using untagged $executeRawUnsafe only for TRUNCATE with static table names.
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Pledge" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "RefundedPledge" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Auction" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');

    // 3) Reseed minimal data (mirrors prisma/seed.ts in-controller to avoid subprocess)
    //    Admin user
    const admin = await prisma.user.create({
      data: {
        id: 'admin',
        ordinal_address: 'bc1pkddf9em6k82spy0ysxdqp5t5puuwdkn6prhcqvhf6vf8tcc686lq4uy0ca',
        connected: true,
        network: 'mainnet',
      },
    });

    //    Test users
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
      testUsers.map(async (u) =>
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

    //    New 72h auction
    const now = new Date();
    const endTime = addHours(now, 72);

    const auction = await prisma.auction.create({
      data: {
        id: '3551190a-c374-4089-a4b0-35912e65ebdd',
        totalTokens: 100_000_000,
        ceilingMarketCap: 15_000_000,
        totalBTCPledged: 0,
        refundedBTC: 0,
        startTime: now,
        endTime,
        isActive: true,
        isCompleted: false,
        // min/max in sats
        minPledgeSats: 100_000,
        maxPledgeSats: 50_000_000,
      },
    });

    //    Sample pledges
    for (const u of testUsers) {
      await prisma.pledge.create({
        data: {
          userId: u.id,
          auctionId: auction.id,
          // store pledge in sats per new schema
          satAmount: Math.round(u.pledgeAmount * 1e8),
          depositAddress: 'generated-deposit-address',
          status: 'confirmed',
          verified: true,
        },
      });
    }

    //    Update totals
    const totalPledged = testUsers.reduce((sum, u) => sum + u.pledgeAmount, 0);
    const updatedAuction = await prisma.auction.update({
      where: { id: auction.id },
      data: { totalBTCPledged: totalPledged },
    });

    // 4) Broadcast update and respond
    await broadcastAuctionUpdate(updatedAuction.id);

    return res.status(200).json({
      message: 'Database reset and reseeded successfully',
      auction: updatedAuction,
      adminId: admin?.id ?? null,
    });
  } catch (error) {
    console.error('Error during full reset:', error);
    return res.status(500).json({ error: 'Failed to fully reset and reseed database' });
  }
};

// Search auctions
export const searchAuctions = async (req: Request, res: Response) => {
  try {
    const { query, isActive, isCompleted } = req.query;
    
    const where: any = {};
    
    if (query) {
      where.OR = [
        { id: { contains: query as string, mode: 'insensitive' } }
        // Note: title and description fields don't exist in the schema
      ];
    }
    
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }
    
    if (isCompleted !== undefined) {
      where.isCompleted = isCompleted === 'true';
    }
    
    const auctions = await prisma.auction.findMany({
      where,
      include: {
        _count: {
          select: { pledges: true }
        }
      },
      orderBy: { startTime: 'desc' }
    });
    
    res.status(200).json(auctions);
  } catch (error) {
    console.error('Search auctions error:', error);
    res.status(500).json({ message: 'Server error searching auctions' });
  }
};
