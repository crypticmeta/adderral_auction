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

  private async getTxStatus(txid: string, network: BtcNetwork): Promise<{ confirmed: boolean; confirmations: number; fee?: number } | null> {
    // TESTING short-circuit: randomly return confirmed
    if (config.testing) {
      const confirmed = Math.random() < 0.5; // 50% chance
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

        const result = await this.getTxStatus(txid, pledge.network);
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
