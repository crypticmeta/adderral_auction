/**
 * Scheduled Tasks Service
 * Handles periodic tasks like checking auction time limits and refreshing Bitcoin price
 */

import prisma from '../config/prisma';
import { bitcoinPriceService } from './bitcoinPriceService';
import { broadcastAuctionUpdate } from '../controllers/auctionController';
import { redisClient } from '../config/redis';
import { txConfirmationService } from './txConfirmationService';
import type { Server } from 'socket.io';

// Prisma client provided by singleton

let priceInterval: NodeJS.Timeout | null = null;
let txCheckInterval: NodeJS.Timeout | null = null;

// Check for expired auctions every minute
export const startAuctionTimeCheck = () => {
  console.log('Starting scheduled auction time check service');
  
  // Run immediately on startup
  checkExpiredAuctions();
  
  // Then schedule to run every minute
  setInterval(checkExpiredAuctions, 60 * 1000);
};

// Refresh Bitcoin price every 15 minutes
export const startBitcoinPriceRefresh = () => {
  console.log('Starting scheduled Bitcoin price refresh service');
  
  // Run immediately on startup (but skip if cache is warm enough)
  maybeRefreshBitcoinPrice();
  
  // Then schedule to run every 15 minutes
  if (priceInterval) {
    // clear pre-existing interval to avoid leaks
    clearInterval(priceInterval);
    priceInterval = null;
  }
  priceInterval = setInterval(maybeRefreshBitcoinPrice, 15 * 60 * 1000);
  if (priceInterval && typeof (priceInterval as any).unref === 'function') {
    (priceInterval as any).unref();
  }
};

// Stop the periodic Bitcoin price refresh interval (used by tests to avoid leaks)
export const stopBitcoinPriceRefresh = () => {
  if (priceInterval) {
    clearInterval(priceInterval);
    priceInterval = null;
  }
};

// Periodically check unverified pledges' tx confirmations
export const startTxConfirmationChecks = (io: Server) => {
  console.log('Starting scheduled Tx confirmation check service');
  // Run immediately on startup
  txConfirmationService.checkUnverifiedPledges(io).catch((e) =>
    console.error('Initial tx confirmation run error:', e)
  );
  // Then schedule every 30 seconds
  if (txCheckInterval) {
    clearInterval(txCheckInterval);
    txCheckInterval = null;
  }
  txCheckInterval = setInterval(() => {
    txConfirmationService.checkUnverifiedPledges(io).catch((e) =>
      console.error('Periodic tx confirmation run error:', e)
    );
  }, 30 * 1000);
  if (txCheckInterval && typeof (txCheckInterval as any).unref === 'function') {
    (txCheckInterval as any).unref();
  }
};

export const stopTxConfirmationChecks = () => {
  if (txCheckInterval) {
    clearInterval(txCheckInterval);
    txCheckInterval = null;
  }
};

// Check for auctions that have reached their 72-hour time limit
const checkExpiredAuctions = async () => {
  try {
    const now = new Date();
    
    // Find active auctions that have reached their end time
    const expiredAuctions = await prisma.auction.findMany({
      where: {
        isActive: true,
        isCompleted: false,
        endTime: {
          lte: now
        }
      }
    });
    
    if (expiredAuctions.length > 0) {
      console.log(`Found ${expiredAuctions.length} expired auctions to complete`);
      
      // Complete each expired auction
      for (const auction of expiredAuctions) {
        await prisma.auction.update({
          where: { id: auction.id },
          data: {
            isActive: false,
            isCompleted: true
          }
        });
        
        console.log(`Auction ${auction.id} completed due to reaching 72-hour time limit`);
        
        // Broadcast the update to connected clients
        await broadcastAuctionUpdate(auction.id);
      }
    }
  } catch (error) {
    console.error('Error checking expired auctions:', error);
  }
};

// Only refresh Bitcoin price if cache is missing or near expiry
const maybeRefreshBitcoinPrice = async () => {
  try {
    const CACHE_KEY = 'btc:price:usd';
    const WARM_THRESHOLD_SECONDS = 5 * 60; // refresh if <= 5 minutes left

    const ttl = await redisClient.ttl(CACHE_KEY);

    // ttl === -2 -> key does not exist; ttl === -1 -> no expiry set
    if (ttl === -2 || ttl === -1 || ttl <= WARM_THRESHOLD_SECONDS) {
      await refreshBitcoinPrice();
      return;
    }

    // Cache warm enough; optionally log current cached value
    const cached = await redisClient.get(CACHE_KEY);
    if (cached != null) {
      console.log(`Bitcoin price cache warm (ttl ${ttl}s): $${cached}`);
    } else {
      // Safety: if cache disappeared between ttl and get
      await refreshBitcoinPrice();
    }
  } catch (error) {
    console.error('Error checking Bitcoin price cache TTL:', error);
    // Fallback: attempt a refresh
    await refreshBitcoinPrice();
  }
};

// Refresh Bitcoin price
const refreshBitcoinPrice = async () => {
  try {
    const price = await bitcoinPriceService.refreshBitcoinPrice();
    console.log(`Bitcoin price refreshed: $${price}`);
  } catch (error) {
    console.error('Error refreshing Bitcoin price:', error);
  }
};
