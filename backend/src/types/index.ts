/**
 * Centralized type definitions for the adderrels-auction backend
 * Updated: pledge amounts stored as sats (satAmount) and address fields renamed
 */

// Pledge related types
export interface PledgeType {
  id: string;
  userId: string;
  auctionId: string;
  satAmount: number; // amount in sats
  timestamp: Date;
  depositAddress: string;
  signature: string | null;
  cardinal_address: string | null;
  txid: string | null;
  fee: number | null;
  confirmations: number | null;
  status: string;
  verified: boolean;
  processed: boolean;
  needsRefund: boolean;
  ordinal_address: string | null;
}

// Queue related types
export interface QueuedPledge {
  id: string;
  userId: string;
  btcAmount: number; // BTC (derived from sats at enqueue time)
  auctionId: string;
  timestamp: string;
  sender: string; // cardinal address
  depositAddress: string;
  signature: string | null;
  needsRefund?: boolean;
}

// Auction related types (min/max in sats)
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
  minPledgeSats: number;
  maxPledgeSats: number;
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
