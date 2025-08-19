/**
 * Centralized type definitions for the acornAuction backend
 */

// Pledge related types
export interface PledgeType {
  id: string;
  userId: string;
  auctionId: string;
  btcAmount: number;
  timestamp: Date;
  depositAddress: string;
  signature: string | null;
  sender: string | null;
  txid: string | null;
  fee: number | null;
  confirmations: number | null;
  status: string;
  verified: boolean;
  processed: boolean;
  needsRefund: boolean;
  recipient: string | null;
}

// Queue related types
export interface QueuedPledge {
  id: string;
  userId: string;
  btcAmount: number;
  auctionId: string;
  timestamp: string;
  sender: string;
  depositAddress: string;
  signature: string | null;
  needsRefund?: boolean;
}

// Auction related types
export interface AuctionType {
  id: string;
  totalTokens: number;
  ceilingMarketCap: number;
  totalBTCPledged: number;
  refundedBTC: number;
  startTime: Date;
  endTime: Date;
  isActive: boolean;
  isCompleted: boolean;
  minPledge: number;
  maxPledge: number;
}

// User related types
export interface UserType {
  id: string;
  cardinal_address?: string | null;
  ordinal_address?: string | null;
  cardinal_pubkey?: string | null;
  ordinal_pubkey?: string | null;
  wallet?: string | null;
  signature?: string | null;
  message?: string | null;
  network?: string | null;
  connected: boolean;
  createdAt: Date;
}

// Refunded pledge related types
export interface RefundedPledgeType {
  id: string;
  userId: string;
  btcAmount: number;
  depositAddress: string;
  txid?: string | null;
  timestamp: Date;
  auctionId: string;
  refundTxid?: string | null;
  refunded: boolean;
}

// MultiWallet data interface
export interface MultiWalletData {
  userId: string;
  btcAddress: string;
  taprootAddress: string;
  publicKey: string;
  network: string;
  signature: string;
}
