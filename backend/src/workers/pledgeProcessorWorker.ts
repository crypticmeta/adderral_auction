/**
 * Pledge Processor Worker
 * Periodically processes the FCFS Redis pledge queue per active auction.
 * Mirrors controller logic to enforce ceiling and mark pledges accepted/refund.
 *
 * Notes:
 * - FCFS order is based on pledge.timestamp (ZSET score)
 * - processed/needsRefund are business flags and independent of chain confirmation
 * - This worker does not require Socket.IO; broadcasts are optional
 */

import prisma from '../config/prisma';
import config from '../config/config';
import { PledgeQueueService } from '../services/pledgeQueueService';
import { BitcoinPriceService } from '../services/bitcoinPriceService';

const pledgeQueueService = PledgeQueueService.getInstance();
const btcPriceService = BitcoinPriceService.getInstance();

// Tuning knobs via env
const INTERVAL_MS = Number(process.env.QUEUE_PROCESS_INTERVAL_MS || 2000); // 2s default
const MAX_DEQUEUE_PER_TICK = Number(process.env.QUEUE_MAX_PER_TICK || 10); // safety cap

async function processAuctionOnce(auctionId: string): Promise<boolean> {
  // Returns true if any pledge was processed in this invocation
  try {
    // Fetch latest auction snapshot
    const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction) return false;

    // Price required to convert ceiling USD -> BTC
    const btcPrice = await btcPriceService.getBitcoinPrice();
    if (!(btcPrice && btcPrice > 0)) {
      // Skip this round if price is unavailable
      return false;
    }

    // Confirmed BTC (processed or verified, excluding refunds) to avoid drift
    const confirmedAgg = await prisma.pledge.aggregate({
      _sum: { satAmount: true },
      where: {
        auctionId,
        needsRefund: false,
        OR: [
          { processed: true },
          { verified: true }
        ]
      }
    });
    const confirmedBTC = Number(confirmedAgg._sum?.satAmount || 0) / 1e8;

    const ceilingBTC = (auction.ceilingMarketCap || 0) / btcPrice;

    // Pop next pledge from the queue and decide accept/refund
    const pledge = await pledgeQueueService.processNextPledge(
      ceilingBTC,
      confirmedBTC
    );

    if (!pledge) {
      return false; // nothing in queue
    }

    // Apply DB side-effects to reflect business decision
    if (!pledge.needsRefund) {
      await prisma.auction.update({
        where: { id: auctionId },
        data: { totalBTCPledged: { increment: pledge.btcAmount } }
      });
    }

    await prisma.pledge.update({
      where: { id: pledge.id },
      data: {
        processed: true,
        needsRefund: Boolean(pledge.needsRefund)
      }
    });

    return true;
  } catch (err) {
    console.error('[Worker] Error processing auction', auctionId, err);
    return false;
  }
}

async function drainQueuesTick() {
  try {
    // Find active auctions for the configured network only
    const toEnumNetwork = (n: string | null | undefined) =>
      (String(n).toLowerCase() === 'testnet' ? 'TESTNET' : 'MAINNET');

    const net = toEnumNetwork(config.btcNetwork);

    const auctions = await prisma.auction.findMany({
      where: { isActive: true, network: net },
      select: { id: true }
    });

    for (const a of auctions) {
      let processedCount = 0;
      for (let i = 0; i < MAX_DEQUEUE_PER_TICK; i++) {
        const didProcess = await processAuctionOnce(a.id);
        if (!didProcess) break;
        processedCount += 1;
      }
      if (processedCount > 0) {
        console.log(`[Worker] Auction ${a.id}: processed ${processedCount} pledge(s)`);
      }
    }
  } catch (e) {
    console.error('[Worker] drainQueuesTick error', e);
  }
}

function start() {
  console.log('[Worker] Pledge Processor Worker started', {
    INTERVAL_MS,
    MAX_DEQUEUE_PER_TICK
  });

  const timer = setInterval(drainQueuesTick, INTERVAL_MS);

  const shutdown = async () => {
    console.log('\n[Worker] Shutting down...');
    clearInterval(timer);
    try {
      await prisma.$disconnect();
    } catch {}
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
