/**
 * Pledge controller
 * Handles pledge creation, verification, and retrieval for the auction system
 * Network safety: enforces auction/pledge network alignment and validates deposit address network
 */

import { Request, Response } from 'express';
import prisma from '../config/prisma';
import config from '../config/config';
import { Server } from 'socket.io';
import { PledgeQueueService } from '../services/pledgeQueueService';
import { BitcoinPriceService } from '../services/bitcoinPriceService';
import { broadcastPledgeCreated } from '../websocket/socketHandler';
import type { BtcNetwork } from '../generated/prisma';

// Prisma client provided by singleton

// Get PledgeQueueService instance
const pledgeQueueService = PledgeQueueService.getInstance();

// Socket.io server instance
let io: Server | null = null;

// Set the Socket.IO server instance
export const setSocketServer = (socketServer: Server) => {
  io = socketServer;
  pledgeQueueService.setSocketServer(socketServer);
};

// Helpers: map config network to Prisma enum and validate BTC address by network
const toEnumNetwork = (n: string | null | undefined): BtcNetwork =>
  (String(n).toLowerCase() === 'testnet' ? 'TESTNET' : 'MAINNET');

const isAddressForNetwork = (addr: string | null | undefined, net: BtcNetwork): boolean => {
  const a = (addr || '').trim();
  if (!a) return false;
  // Bech32
  const isMainBech32 = a.startsWith('bc1');
  const isTestBech32 = a.startsWith('tb1');
  // Legacy/P2SH rough checks
  const isMainLegacy = a.startsWith('1') || a.startsWith('3');
  const isTestLegacy = a.startsWith('m') || a.startsWith('n') || a.startsWith('2');
  if (net === 'MAINNET') return isMainBech32 || isMainLegacy;
  return isTestBech32 || isTestLegacy;
};

/**
 * Get a deposit address for the active auction (pre-payment step)
 */
export const getDepositAddress = async (_req: Request, res: Response) => {
  try {
    // Scope to configured network
    const auction = await prisma.auction.findFirst({ where: { isActive: true, network: toEnumNetwork(config.btcNetwork) } });
    if (!auction) {
      return res.status(404).json({ error: 'No active auction found' });
    }
    // Soft-close admission control: if projected (confirmed + pending) >= ceiling, block address issuance
    try {
      const btcPriceService = BitcoinPriceService.getInstance();
      const price = await btcPriceService.getBitcoinPrice();
      if (price && price > 0) {
        const pendingAgg = await prisma.pledge.aggregate({ _sum: { satAmount: true }, where: { auctionId: auction.id, processed: false } });
        const pendingBTC = Number(pendingAgg._sum?.satAmount || 0) / 1e8;
        const confirmedBTC = auction.totalBTCPledged || 0;
        const ceilingBTC = auction.ceilingMarketCap / price;
        const projected = confirmedBTC + pendingBTC;
        if (projected >= ceilingBTC) {
          return res.status(409).json({ error: 'Pledging temporarily paused while pending transactions settle', reason: 'projected_capacity_full' });
        }
      }
    } catch (e) {
      // non-fatal: continue if price unavailable
    }
    const depositAddress = (config.depositAddress || '').trim();
    if (!depositAddress) {
      return res.status(500).json({ error: 'Deposit address not configured. Set BTC_DEPOSIT_ADDRESS in env.' });
    }
    // Validate deposit address network alignment
    if (!isAddressForNetwork(depositAddress, auction.network)) {
      return res.status(500).json({ error: `Configured deposit address does not match ${auction.network} network` });
    }
    return res.status(200).json({ depositAddress, network: auction.network });
  } catch (error) {
    console.error('Error getting deposit address:', error);
    return res.status(500).json({ error: 'Failed to get deposit address' });
  }
};

/**
 * Attach a transaction ID to an existing pledge (no verification here)
 * Scheduler will later verify/confirm via mempool.
 */
export const attachPledgeTxid = async (req: Request, res: Response) => {
  try {
    const { pledgeId, txid } = req.body;

    if (!pledgeId || !txid) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const pledge = await prisma.pledge.findUnique({ where: { id: pledgeId } });
    if (!pledge) {
      return res.status(404).json({ error: 'Pledge not found' });
    }

    const updated = await prisma.pledge.update({
      where: { id: pledgeId },
      data: {
        txid,
        // mark as pending; scheduler will update these
        status: 'pending',
        confirmations: 0,
        verified: false,
      },
      include: { user: true },
    });

    return res.status(200).json(updated);
  } catch (error) {
    console.error('Error attaching txid to pledge:', error);
    return res.status(500).json({
      error: 'Failed to attach txid',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get pledges for a user by cardinal (sender) address within an auction
 */
export const getUserPledgesByCardinal = async (req: Request, res: Response) => {
  try {
    const cardinalAddress = req?.params?.cardinalAddress ?? '';
    const auctionId = req?.params?.auctionId ?? '';

    if (!cardinalAddress || typeof cardinalAddress !== 'string') {
      return res.status(400).json({ error: 'Cardinal address is required' });
    }
    if (!auctionId || typeof auctionId !== 'string') {
      return res.status(400).json({ error: 'Auction ID is required' });
    }

    const pledges = await prisma.pledge.findMany({
      where: {
        auctionId,
        cardinal_address: cardinalAddress
      },
      orderBy: { timestamp: 'asc' }
    });

    const enrichedPledges = await Promise.all(pledges.map(async (pledge) => {
      const position = await pledgeQueueService.getPledgePosition(pledge.id);
      const { processed, needsRefund } = await pledgeQueueService.getPledgeProcessedStatus(pledge.id);
      const sat = (pledge as any).satAmount ?? 0;
      return {
        ...pledge,
        // canonical exposure
        satsAmount: sat,
        queuePosition: position,
        processed,
        needsRefund
      };
    }));

    return res.status(200).json(enrichedPledges);
  } catch (error) {
    console.error('Error getting pledges by cardinal address:', error);
    return res.status(500).json({
      error: 'Failed to get pledges by cardinal address',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
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
    const { userId, satsAmount, walletDetails, signature, txid, depositAddress: depositFromBody } = req.body as any;

    if (!userId || !satsAmount || !walletDetails || !txid) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate the user exists; if not and userId is the cardinal address, upsert safely
    let user = await prisma.user.findUnique({ where: { id: userId } });

    // Get active auction for configured network only
    const auction = await prisma.auction.findFirst({
      where: { isActive: true, network: toEnumNetwork(config.btcNetwork) }
    });

    if (!auction) {
      return res.status(404).json({ error: 'No active auction found' });
    }

    // Optional: If client provided a network inside walletDetails, require it to match auction network
    const clientNet = (walletDetails?.network as string | undefined) || null;
    if (clientNet && toEnumNetwork(clientNet) !== auction.network) {
      return res.status(400).json({ error: `Wallet network (${clientNet}) does not match auction network (${auction.network})` });
    }

    // If user not found and userId equals provided cardinal address, create the user with id = cardinal address
    if (!user) {
      const cardinalAddr: string = (walletDetails?.cardinal || '').trim();
      const ordinalAddr: string = (walletDetails?.ordinal || '').trim();
      if (cardinalAddr && cardinalAddr === userId) {
        // Ensure address matches auction network to avoid cross-network collisions
        if (!isAddressForNetwork(cardinalAddr, auction.network)) {
          return res.status(400).json({ error: `Provided cardinal address does not match ${auction.network} network` });
        }
        user = await prisma.user.upsert({
          where: { id: userId },
          update: {
            wallet: (walletDetails?.wallet as string | undefined) || undefined,
            cardinal_address: cardinalAddr,
            ordinal_address: ordinalAddr || undefined,
            cardinal_pubkey: (walletDetails?.cardinalPubkey as string | undefined) || undefined,
            ordinal_pubkey: (walletDetails?.ordinalPubkey as string | undefined) || undefined,
            network: String(config.btcNetwork || 'mainnet').toLowerCase(),
            connected: true,
          },
          create: {
            id: userId,
            wallet: (walletDetails?.wallet as string | undefined) || undefined,
            cardinal_address: cardinalAddr,
            ordinal_address: ordinalAddr || undefined,
            cardinal_pubkey: (walletDetails?.cardinalPubkey as string | undefined) || undefined,
            ordinal_pubkey: (walletDetails?.ordinalPubkey as string | undefined) || undefined,
            network: String(config.btcNetwork || 'mainnet').toLowerCase(),
            connected: true,
          }
        });
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validate pledge amount with projected capacity (confirmed + pending)
    const maxPledge = await calculateMaxPledgeInternal(auction);
    const minBTC = ((auction?.minPledgeSats ?? 0) as number) / 1e8;
    const btcValue = Number(satsAmount) / 1e8;
    if (btcValue < minBTC || btcValue > maxPledge) {
      return res.status(400).json({
        error: `Pledge amount must be between ${minBTC} and ${maxPledge} BTC`
      });
    }

    // Admission control based on projected totals
    try {
      const btcPriceService = BitcoinPriceService.getInstance();
      const price = await btcPriceService.getBitcoinPrice();
      if (!(price > 0)) {
        return res.status(503).json({ error: 'BTC price unavailable; cannot validate capacity' });
      }
      const pendingAgg = await prisma.pledge.aggregate({ _sum: { satAmount: true }, where: { auctionId: auction.id, processed: false } });
      const pendingBTC = Number(pendingAgg._sum?.satAmount || 0) / 1e8;
      const confirmedBTC = auction.totalBTCPledged || 0;
      const ceilingBTC = auction.ceilingMarketCap / price;
      const projected = confirmedBTC + pendingBTC;
      const remaining = Math.max(0, ceilingBTC - projected);
      if (remaining <= 0 || btcValue > remaining) {
        return res.status(409).json({ error: 'Capacity full due to pending transactions. Please try again later.', reason: 'projected_capacity_full', remainingBTC: remaining });
      }
    } catch (e) {
      // If anything goes wrong, be safe and block to avoid over-pledge
      return res.status(503).json({ error: 'Capacity check failed; please retry shortly' });
    }
    // Use provided deposit address when available (recommended); fallback to placeholder
    const depositAddress = depositFromBody ?? `btc_deposit_${Date.now().toString(16)}`;
    // Validate deposit address network alignment only if provided by client
    if (depositFromBody && !isAddressForNetwork(depositAddress, auction.network)) {
      return res.status(400).json({ error: `Deposit address does not match ${auction.network} network` });
    }

    // Normalize wallet fields from walletDetails
    const cardinalAddress: string | null = (walletDetails?.cardinal as string | undefined) || null;
    const ordinalAddress: string | null = (walletDetails?.ordinal as string | undefined) || null;

    // Create the pledge in the database (inherit auction network)
    const pledge = await prisma.pledge.create({
      data: {
        userId,
        // store in sats (canonical)
        satAmount: Math.round(Number(satsAmount)),
        auctionId: auction.id,
        depositAddress,
        signature: signature ?? null,
        cardinal_address: cardinalAddress,
        ordinal_address: ordinalAddress,
        // inherit network from auction to route mempool queries correctly
        network: auction.network,
        processed: false,
        needsRefund: false,
        // set txid immediately; verification handled by scheduler
        txid,
        status: 'pending',
        confirmations: 0,
        verified: false
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
      // explicit canonical field for clients
      satsAmount: pledge.satAmount,
      refundedSats: (pledge as any).refundedSats ?? undefined,
      queuePosition
    });
  } catch (error: any) {
    console.error('Error creating pledge:', error);
    return res.status(500).json({
      error: 'Failed to create pledge',
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
    
    // Enrich pledges with queue position, processed status, refund status, and canonical satsAmount
    const enrichedPledges = await Promise.all(pledges.map(async (pledge) => {
      const position = await pledgeQueueService.getPledgePosition(pledge.id);
      const { processed, needsRefund } = await pledgeQueueService.getPledgeProcessedStatus(pledge.id);
      return {
        ...pledge,
        satsAmount: (pledge as any).satAmount ?? 0,
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
    
    // Enrich pledges with queue position, processed status, refund status, and canonical satsAmount
    const enrichedPledges = await Promise.all(pledges.map(async (pledge) => {
      const position = await pledgeQueueService.getPledgePosition(pledge.id);
      const { processed, needsRefund } = await pledgeQueueService.getPledgeProcessedStatus(pledge.id);
      return {
        ...pledge,
        satsAmount: (pledge as any).satAmount ?? 0,
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
    
    // Get current BTC price and compute pending/projected
    const btcPriceService = BitcoinPriceService.getInstance();
    const btcPrice = await btcPriceService.getBitcoinPrice();
    let pendingSats = 0;
    let projectedRemainingSats = null as number | null;
    let projectedPercent = null as number | null;
    if (btcPrice && btcPrice > 0) {
      const pendingAgg = await prisma.pledge.aggregate({ _sum: { satAmount: true }, where: { auctionId, processed: false } });
      pendingSats = Number(pendingAgg._sum?.satAmount || 0);
      const confirmedBTC = auction.totalBTCPledged || 0;
      const pendingBTC = pendingSats / 1e8;
      const ceilingBTC = auction.ceilingMarketCap / btcPrice;
      const projected = confirmedBTC + pendingBTC;
      const remainingBTC = Math.max(0, ceilingBTC - projected);
      projectedRemainingSats = Math.round(remainingBTC * 1e8);
      const denom = ceilingBTC > 0 ? ceilingBTC : 1;
      projectedPercent = Math.max(0, Math.min(100, (projected / denom) * 100));
    }

    return res.status(200).json({
      // canonical sats fields only
      minPledgeSats: auction?.minPledgeSats ?? undefined,
      maxPledgeSats: auction?.maxPledgeSats ?? undefined,
      currentBTCPrice: btcPrice,
      pendingPledgeSats: pendingSats,
      projectedRemainingSats,
      projectedPercent
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
    
    // Compute BTC price to convert ceiling USD -> BTC
    const btcPriceService = BitcoinPriceService.getInstance();
    const btcPrice = await btcPriceService.getBitcoinPrice();
    if (!(btcPrice > 0)) {
      return res.status(503).json({ error: 'BTC price unavailable; cannot process queue safely' });
    }

    // Confirmed BTC from DB (processed and not refunded) to avoid drift
    const confirmedAgg = await prisma.pledge.aggregate({
      _sum: { satAmount: true },
      where: { auctionId, processed: true, needsRefund: false }
    });
    const confirmedBTC = Number(confirmedAgg._sum?.satAmount || 0) / 1e8;

    // Convert ceiling USD to BTC using current price
    const ceilingBTC = auction.ceilingMarketCap / btcPrice;

    // Process the next pledge using BTC-denominated ceiling and totals
    const pledge = await pledgeQueueService.processNextPledge(
      ceilingBTC,
      confirmedBTC
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
