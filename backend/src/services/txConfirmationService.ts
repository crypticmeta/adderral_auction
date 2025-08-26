/**
 * Tx Confirmation Service
 * Periodically checks mempool.space for tx confirmations and updates pledges
 */

import axios from 'axios';
import prisma from '../config/prisma';
import { BtcNetwork } from '../generated/prisma';
import config from '../config/config';
import { broadcastPledgeVerified } from '../websocket/socketHandler';

// Prisma client provided by singleton

export class TxConfirmationService {
  private static instance: TxConfirmationService;

  private constructor() {}

  public static getInstance(): TxConfirmationService {
    if (!TxConfirmationService.instance) {
      TxConfirmationService.instance = new TxConfirmationService();
    }
    return TxConfirmationService.instance;
  }

  private getMempoolBase(network: BtcNetwork): string {
    const main = config.mempool?.mainnetBase ?? 'https://mempool.space/api';
    const test = config.mempool?.testnetBase ?? 'https://mempool.space/testnet/api';
    return network === 'TESTNET' ? test : main;
  }

  private async getTxStatus(txid: string, network: BtcNetwork, pledgeTimestamp?: Date): Promise<{ confirmed: boolean; confirmations: number; fee?: number } | null> {
    // TESTING short-circuit: confirm between 3-10 minutes after pledge time (deterministic per txid)
    if (config.testing) {
      const minMin = parseInt(process.env.TEST_CONFIRM_MIN_MINUTES || '3', 10);
      const maxMin = parseInt(process.env.TEST_CONFIRM_MAX_MINUTES || '10', 10);
      const min = Math.max(1, Math.min(minMin, maxMin));
      const max = Math.max(min, maxMin);
      const range = max - min + 1;

      // Simple deterministic hash from txid
      let hash = 0;
      for (let i = 0; i < txid.length; i++) {
        hash = (hash * 31 + txid.charCodeAt(i)) >>> 0;
      }
      const thresholdMinutes = min + (hash % range);

      const now = Date.now();
      const ts = pledgeTimestamp ? new Date(pledgeTimestamp).getTime() : now;
      const elapsedMinutes = Math.max(0, Math.floor((now - ts) / 60000));

      const confirmed = elapsedMinutes >= thresholdMinutes;
      return { confirmed, confirmations: confirmed ? 1 : 0 };
    }

    const base = this.getMempoolBase(network);
    try {
      // status endpoint has confirmed flag and block info
      const statusUrl = `${base}/tx/${txid}/status`;
      const txUrl = `${base}/tx/${txid}`;

      const [statusRes, txRes] = await Promise.all([
        axios.get(statusUrl, { timeout: 8000 }),
        axios.get(txUrl, { timeout: 8000 }),
      ]);

      const status = statusRes?.data as { confirmed?: boolean; block_height?: number };
      const tx = txRes?.data as { fee?: number; status?: { confirmed?: boolean; block_height?: number } };

      const confirmed = Boolean(status?.confirmed ?? tx?.status?.confirmed);

      // Best-effort confirmations count using tip height if available (mempool has /blocks, but we avoid extra calls)
      // If confirmed and block_height exists, set at least 1 confirmation.
      const confirmations = confirmed ? 1 : 0;
      const fee = typeof tx?.fee === 'number' ? tx.fee / 1e8 : undefined; // convert sats->BTC if present

      return { confirmed, confirmations, fee };
    } catch (e) {
      console.error('Error fetching tx status from mempool:', e);
      return null;
    }
  }

  public async checkUnverifiedPledges(io?: import('socket.io').Server | null): Promise<void> {
    try {
      const pledges = await prisma.pledge.findMany({
        where: {
          verified: false,
          status: { not: 'failed' },
          txid: { not: null },
        },
        take: 100, // bound per cycle
      });

      if (!pledges || pledges.length === 0) return;

      for (const pledge of pledges) {
        const txid = pledge.txid;
        if (!txid) continue; // null check

        const result = await this.getTxStatus(txid, pledge.network, pledge.timestamp as any);
        if (!result) continue;

        const updateData: any = {
          confirmations: result.confirmations,
          status: result.confirmed ? 'confirmed' : 'pending',
        };
        if (typeof result.fee === 'number') {
          updateData.fee = result.fee;
        }
        if (result.confirmed) {
          updateData.verified = true;
        }

        const updated = await prisma.pledge.update({
          where: { id: pledge.id },
          data: updateData,
          include: { user: true },
        });

        if (result.confirmed && io) {
          // Notify via websocket
          try {
            broadcastPledgeVerified(io, updated as any);
          } catch (err) {
            console.error('Error broadcasting pledge verified:', err);
          }
        }
      }
    } catch (error) {
      console.error('Error checking unverified pledges:', error);
    }
  }
}

export const txConfirmationService = TxConfirmationService.getInstance();
