// Common shared types used across frontend and possibly backend
// Includes wallet metadata, pledge queue items, and minimal state shapes.

export type Network = 'mainnet' | 'testnet' | string;

export interface WalletInfo {
  address: string | null;
  ordinalAddress: string | null;
  publicKey: string | null;
  ordinalPubKey: string | null;
  wallet: string | null;
  network: Network | null;
}

export interface DepositAddressResponse {
  depositAddress: string | null;
  network?: Network | null;
}

export interface MaxPledgeInfo {
  minPledge: number; // BTC
  maxPledge: number; // BTC
  currentBTCPrice: number; // USD
  minPledgeUSD?: number; // USD (optional if not provided by backend)
  maxPledgeUSD?: number; // USD (optional if not provided by backend)
}

export interface PledgeUser {
  cardinal_address?: string | null;
  ordinal_address?: string | null;
}

export interface PledgeItem {
  id: string;
  userId: string;
  btcAmount: number; // BTC
  timestamp?: string | null;
  queuePosition?: number | null;
  processed: boolean;
  needsRefund: boolean;
  user?: PledgeUser;
  txid?: string | null;
  verified?: boolean;
  confirmations?: number;
  status?: string | null;
  refundedAmount?: number; // BTC
}

export interface QueuePositionEvent {
  pledgeId?: string;
  id?: string;
  position?: number;
  queuePosition?: number;
}

export interface AuctionStateMinimal {
  id?: string;
  isActive?: boolean;
  ceilingReached?: boolean;
  currentPrice?: number;
  totalRaised?: number;
  config?: { totalTokens?: string };
}
