/**
 * Pledge Queue Service
 * Manages a Redis-based queue for FCFS pledge processing with timestamps
 */

import { redisClient } from '../config/redis';
import { Server } from 'socket.io';
import { PrismaClient } from '../generated/prisma';
import { QueuedPledge } from '../types';

export class PledgeQueueService {
  private static instance: PledgeQueueService;
  private readonly QUEUE_KEY = 'auction:pledge:queue';
  private readonly PROCESSED_SET_KEY = 'auction:pledge:processed';
  private io: Server | null = null;

  private constructor() {}

  public static getInstance(): PledgeQueueService {
    if (!PledgeQueueService.instance) {
      PledgeQueueService.instance = new PledgeQueueService();
    }
    return PledgeQueueService.instance;
  }

  public setSocketServer(socketServer: Server): void {
    this.io = socketServer;
  }

  /**
   * Add a pledge to the queue with timestamp
   */
  public async enqueuePledge(pledge: QueuedPledge): Promise<boolean> {
    try {
      // Create a sorted set entry with timestamp as score for perfect ordering
      const timestamp = new Date(pledge.timestamp).getTime();
      
      // Add to sorted set with timestamp as score
      await redisClient.zadd(this.QUEUE_KEY, timestamp, JSON.stringify(pledge));
      
      // Broadcast queue update via WebSocket if available
      this.broadcastQueueUpdate();
      
      return true;
    } catch (error) {
      console.error('Error enqueueing pledge:', error);
      return false;
    }
  }

  /**
   * Get all pledges in the queue, ordered by timestamp
   */
  public async getAllPledges(): Promise<QueuedPledge[]> {
    try {
      // Get all entries from the sorted set, ordered by score (timestamp)
      const pledgeStrings = await redisClient.zrange(this.QUEUE_KEY, 0, -1);
      
      // Parse JSON strings back to objects
      return pledgeStrings.map(str => JSON.parse(str) as QueuedPledge);
    } catch (error) {
      console.error('Error getting pledges from queue:', error);
      return [];
    }
  }

  /**
   * Get the position of a pledge in the queue
   */
  public async getPledgePosition(pledgeId: string): Promise<number> {
    try {
      const pledges = await this.getAllPledges();
      const index = pledges.findIndex(p => p.id === pledgeId);
      return index >= 0 ? index + 1 : -1; // 1-based position, -1 if not found
    } catch (error) {
      console.error('Error getting pledge position:', error);
      return -1;
    }
  }

  /**
   * Process the next pledge in the queue
   * @param ceilingMarketCap The ceiling market cap of the auction
   * @param currentTotalPledged The current total BTC pledged
   */
  public async processNextPledge(ceilingMarketCap: number, currentTotalPledged: number): Promise<QueuedPledge | null> {
    try {
      // Get the earliest pledge (lowest score/timestamp)
      const result = await redisClient.zpopmin(this.QUEUE_KEY);
      
      if (!result || result.length < 2) {
        return null;
      }
      
      const [pledgeString, _score] = result;
      const pledge = JSON.parse(pledgeString) as QueuedPledge;
      
      // Check if this pledge would exceed the ceiling market cap
      const wouldExceedCeiling = currentTotalPledged + pledge.btcAmount > ceilingMarketCap;
      
      // If it would exceed, mark it for refund
      if (wouldExceedCeiling) {
        pledge.needsRefund = true;
      }
      
      // Add to processed set to keep track
      await redisClient.sadd(this.PROCESSED_SET_KEY, JSON.stringify(pledge));
      
      // Broadcast queue update
      this.broadcastQueueUpdate();
      
      return pledge;
    } catch (error) {
      console.error('Error processing next pledge:', error);
      return null;
    }
  }

  /**
   * Check if a pledge has been processed and if it needs a refund
   */
  public async getPledgeProcessedStatus(pledgeId: string): Promise<{ processed: boolean, needsRefund: boolean }> {
    try {
      const processedPledges = await redisClient.smembers(this.PROCESSED_SET_KEY);
      let processed = false;
      let needsRefund = false;
      
      for (const pledgeStr of processedPledges) {
        try {
          const pledge = JSON.parse(pledgeStr) as QueuedPledge;
          if (pledge.id === pledgeId) {
            processed = true;
            needsRefund = pledge.needsRefund || false;
            break;
          }
        } catch {
          continue;
        }
      }
      
      return { processed, needsRefund };
    } catch (error) {
      console.error('Error checking pledge processed status:', error);
      return { processed: false, needsRefund: false };
    }
  }
  
  /**
   * Check if a pledge has been processed
   */
  public async isPledgeProcessed(pledgeId: string): Promise<boolean> {
    const { processed } = await this.getPledgeProcessedStatus(pledgeId);
    return processed;
  }

  /**
   * Calculate the maximum pledge amount that avoids hitting the ceiling
   */
  public async calculateMaxPledgeAmount(
    auctionId: string, 
    minPledge: number, 
    maxPledge: number, 
    ceilingMarketCap: number, 
    currentTotalPledged: number
  ): Promise<number> {
    // Get all pending pledges in the queue for this auction
    const allPledges = await this.getAllPledges();
    const auctionPledges = allPledges.filter(p => p.auctionId === auctionId);
    
    // Calculate total BTC in the queue not yet processed
    const queuedBTC = auctionPledges.reduce((sum, pledge) => sum + pledge.btcAmount, 0);
    
    // Calculate remaining BTC before hitting ceiling
    const totalPledgedIncludingQueue = currentTotalPledged + queuedBTC;
    const remainingBeforeCeiling = ceilingMarketCap - totalPledgedIncludingQueue;
    
    // Calculate max amount (cap at maxPledge). Do NOT force it up to min when remaining is below min.
    // This avoids telling clients they can pledge min when remaining is actually lower.
    const cappedByCeiling = Math.min(remainingBeforeCeiling, maxPledge);
    const safeMax = Math.max(0, cappedByCeiling);
    return safeMax;
  }

  /**
   * Broadcast queue update to all connected clients
   */
  private async broadcastQueueUpdate(): Promise<void> {
    if (!this.io) return;
    
    try {
      const pledges = await this.getAllPledges();
      this.io.emit('pledge:queue:update', {
        queueLength: pledges.length,
        pledges: pledges
      });
    } catch (error) {
      console.error('Error broadcasting queue update:', error);
    }
  }
}

export default PledgeQueueService.getInstance();
