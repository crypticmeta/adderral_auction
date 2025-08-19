/**
 * WebSocket handler using Socket.IO
 * Manages real-time communication for auction updates, pledge events, and wallet connections
 */

import { Server, Socket } from 'socket.io';
import http from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { bitcoinPriceService } from '../services/bitcoinPriceService';
import config from '../config/config';
import { PrismaClient } from '../generated/prisma';

type PledgeWithUser = {
  id: string;
  userId: string;
  auctionId: string;
  btcAmount: number;
  depositAddress: string;
  txid?: string | null;
  fee?: number | null;
  confirmations?: number | null;
  status?: string | null;
  timestamp: Date;
  verified: boolean;
  sender?: string | null;
  recipient?: string | null;
  signature?: string | null;
  user: {
    id: string;
    cardinal_address: string | null;
    ordinal_address: string | null;
    cardinal_pubkey: string | null;
    ordinal_pubkey: string | null;
    wallet: string | null;
    network: string | null;
    connected: boolean;
  };
};

const prisma = new PrismaClient();

// Socket.IO event types
export enum SocketEvents {
  CONNECT = 'connection',
  DISCONNECT = 'disconnect',
  AUTH = 'auth',
  AUCTION_STATUS = 'auction_status',
  PLEDGE_CREATED = 'pledge_created',
  PLEDGE_VERIFIED = 'pledge_verified',
  WALLET_CONNECTED = 'wallet_connected',
  ERROR = 'error'
}

// Initialize Socket.IO with Redis adapter
export const initializeSocketIO = (server: http.Server): Server => {
  // Create Redis pub/sub clients
  const pubClient = new Redis(config.redis.url);
  const subClient = pubClient.duplicate();

  // Create Socket.IO server
  const io = new Server(server, {
    cors: {
      origin: config.clientUrl,
      methods: ['GET', 'POST'],
      credentials: true
    },
    adapter: createAdapter(pubClient, subClient)
  });

  // Set up simplified authentication middleware
  io.use(async (socket, next) => {
    try {
      // Get guestId from query params or auth data
      let guestId = socket.handshake.query.guestId as string;
      
      // Fallback to auth data if not in query
      if (!guestId && socket.handshake.auth) {
        guestId = socket.handshake.auth.guestId;
      }
      
      // Generate a new guestId if none provided
      if (!guestId) {
        guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      }
      
      // Store user data in socket
      socket.data.userId = guestId;
      socket.data.isAuthenticated = true;

      // Check if user exists in database, create if not
      try {
        const user = await prisma.user.findUnique({
          where: { id: guestId }
        });

        if (!user) {
          await prisma.user.create({
            data: { id: guestId }
          });
        }
      } catch (error) {
        console.error('Database error:', error);
        // Continue even if database operation fails
      }

      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Handle connections
  io.on(SocketEvents.CONNECT, (socket) => {
    console.log(`Client connected: ${socket.id}, User: ${socket.data.userId}`);
    
    // Emit authentication success event
    socket.emit('auth', { 
      success: true, 
      userId: socket.data.userId 
    });

    // Send initial auction status
    sendAuctionStatus(socket);

    // Handle wallet connection
    socket.on(SocketEvents.WALLET_CONNECTED, async (data) => {
      try {
        const { btcAddress, taprootAddress } = data;
        
        // Update user wallet info in database
        await prisma.user.update({
          where: { id: socket.data.userId },
          data: { 
            cardinal_address: btcAddress, 
            ordinal_address: taprootAddress,
            connected: true
          }
        });

        socket.emit(SocketEvents.WALLET_CONNECTED, { success: true });
      } catch (error) {
        console.error('Error updating wallet info:', error);
        socket.emit(SocketEvents.ERROR, { message: 'Failed to update wallet information' });
      }
    });

    // Handle disconnection
    socket.on(SocketEvents.DISCONNECT, () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

// Send auction status to a client
export const sendAuctionStatus = async (socket: any) => {
  try {
    // Get auction data from database
    const auction = await prisma.auction.findFirst({
      where: { isActive: true },
      include: {
        pledges: {
          include: {
            user: true
          }
        }
      }
    });

    if (!auction) {
      socket.emit(SocketEvents.ERROR, { message: 'No active auction found' });
      return;
    }

    // Calculate remaining time
    const now = new Date();
    const remainingTime = Math.max(0, auction.endTime.getTime() - now.getTime());

    // Check if auction should be completed due to time
    if (auction.isActive && remainingTime <= 0) {
      await prisma.auction.update({
        where: { id: auction.id },
        data: { isActive: false, isCompleted: true }
      });
      auction.isActive = false;
      auction.isCompleted = true;
    }

    // Calculate current token price based on BTC price and pledged BTC
    // Do NOT fallback to a hardcoded price; if fetching fails, mark priceError
    let btcPrice: number | null = null;
    let priceError = false;
    try {
      btcPrice = await bitcoinPriceService.getBitcoinPrice();
      if (!(btcPrice > 0)) throw new Error('Invalid BTC price');
    } catch (e) {
      console.error('BTC price unavailable:', e);
      priceError = true;
      btcPrice = null;
    }

    const currentMarketCap = btcPrice ? auction.totalBTCPledged * btcPrice : 0;
    const currentPrice = btcPrice && auction.totalTokens > 0 ? currentMarketCap / auction.totalTokens : 0;
    const ceilingReached = typeof auction.ceilingMarketCap === 'number'
      ? currentMarketCap >= auction.ceilingMarketCap
      : false;

    // Send auction status to client (include key config + timing fields)
    socket.emit('auction_status', {
      isActive: auction.isActive,
      isCompleted: auction.isCompleted,
      totalBTCPledged: auction.totalBTCPledged,
      refundedBTC: auction.refundedBTC ?? 0,
      remainingTime, // ms
      serverTime: now.getTime(), // ms
      startTime: auction.startTime,
      endTime: auction.endTime,
      totalTokens: auction.totalTokens,
      ceilingMarketCap: auction.ceilingMarketCap,
      currentMarketCap,
      minPledge: auction.minPledge,
      maxPledge: auction.maxPledge,
      ceilingReached,
      currentPrice,
      priceError,
      pledges: auction.pledges.map(pledge => ({
        id: pledge.id,
        userId: pledge.userId,
        cardinal_address: pledge.user.cardinal_address,
        ordinal_address: pledge.user.ordinal_address,
        btcAmount: pledge.btcAmount,
        timestamp: pledge.timestamp,
        verified: pledge.verified
      }))
    });
  } catch (error) {
    console.error('Error sending auction status:', error);
    socket.emit(SocketEvents.ERROR, { message: 'Failed to get auction status' });
  }
};

// Broadcast pledge created event to all clients
export const broadcastPledgeCreated = (io: Server, pledge: PledgeWithUser) => {
  io.emit(SocketEvents.PLEDGE_CREATED, {
    id: pledge.id,
    userId: pledge.userId,
    btcAmount: pledge.btcAmount,
    depositAddress: pledge.depositAddress,
    txid: pledge.txid,
    timestamp: pledge.timestamp || new Date(),
    verified: pledge.verified,
    user: {
      id: pledge.user.id,
      cardinal_address: pledge.user.cardinal_address,
      ordinal_address: pledge.user.ordinal_address
    }
  });
};

// Broadcast pledge verified event to all clients
export const broadcastPledgeVerified = (io: Server, pledge: PledgeWithUser) => {
  io.emit(SocketEvents.PLEDGE_VERIFIED, {
    id: pledge.id,
    userId: pledge.userId,
    btcAmount: pledge.btcAmount,
    depositAddress: pledge.depositAddress,
    txid: pledge.txid,
    timestamp: pledge.timestamp || new Date(),
    verified: pledge.verified,
    user: {
      id: pledge.user.id,
      cardinal_address: pledge.user.cardinal_address,
      ordinal_address: pledge.user.ordinal_address
    }
  });
};
