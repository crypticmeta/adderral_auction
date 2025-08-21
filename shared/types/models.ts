// Shared backend model types
// Mirrors backend DB-layer interfaces so both backend and frontend can reference shapes consistently.

// Pledge stored in DB (sats as source of truth)
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

// Queue item used by Redis-based pledge processor
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

// Auction model (min/max in sats)
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

// User model subset used by services/controllers
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

// Refunded pledge record
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

// Multi-wallet data for linking user addresses
export interface MultiWalletData {
  userId: string;
  btcAddress: string;
  taprootAddress: string;
  publicKey: string;
  network: string;
  signature: string;
}
