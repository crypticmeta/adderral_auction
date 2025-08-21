// Common shared types used across frontend and backend
// Includes wallet metadata, pledge queue items, minimal state shapes, and API DTOs.

export type Network = 'mainnet' | 'testnet' | string;

// Canonical wallet DTO used across UI/state AND API payloads (no extra mapping layer)
// Keep this as the single source of truth for wallet fields used in requests/responses.
export interface WalletDetails {
  cardinal: string; // cardinal (legacy/secp) address
  cardinalPubkey: string; // cardinal pubkey (hex)
  ordinal: string; // ordinal/taproot address
  ordinalPubkey: string; // ordinal/taproot pubkey (hex)
  connected: boolean;
  wallet: string; // wallet name/vendor
  derivationPath?: string; // optional derivation path if provided
}

// Legacy WalletInfo removed; use WalletDetails across app.

export interface DepositAddressResponse {
  depositAddress: string | null;
  network?: Network | null;
}

export interface MaxPledgeInfo {
  // Canonical amounts in satoshis
  minPledgeSats?: number; // sats
  maxPledgeSats?: number; // sats
  // Price for UI conversions
  currentBTCPrice: number; // USD
}

export interface PledgeUser {
  cardinal_address?: string | null;
  ordinal_address?: string | null;
}

export interface PledgeItem {
  id: string;
  userId: string;
  // Canonical amount in satoshis
  satsAmount: number; // sats
  timestamp?: string | null;
  queuePosition?: number | null;
  processed: boolean;
  needsRefund: boolean;
  user?: PledgeUser;
  txid?: string | null;
  verified?: boolean;
  confirmations?: number;
  status?: string | null;
  refundedSats?: number; // sats
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

// =========================
// API DTOs (Requests/Responses)
// Keep these in sync with backend controllers and frontend callers
// =========================

// POST /api/pledges
export interface CreatePledgeRequest {
  userId: string;
  // Canonical amount in satoshis
  satsAmount: number; // sats
  walletDetails: WalletDetails;
  signature?: string | null;
  txid: string; // required (obtained after payment)
  depositAddress?: string | null; // optional (server can fallback)
}

export interface CreatePledgeResponse extends PledgeItem {}

// GET /api/pledges/max-pledge/:auctionId
export interface MaxPledgeResponse extends MaxPledgeInfo {}

// GET /api/auction/:auctionId/pledges
export type AuctionPledgesResponse = PledgeItem[];

// GET /api/pledges/user/:userId/auction/:auctionId
export type UserPledgesResponse = PledgeItem[];

// GET /api/pledges/stats
export interface PledgeStatsResponse {
  scope: { type: 'active_auction' | 'all'; auctionId?: string };
  totals: { last24h: number; last48h: number; last72h: number };
  generatedAt: string;
}
