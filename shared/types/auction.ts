// Shared types for auction UI and server shape where applicable
// These types are safe to import in both frontend and backend projects.

// Activity item shown in Recent Activity and emitted by backend
export interface AuctionActivity {
  id: string;
  walletAddress: string;
  btcAmount: string;
  estimatedTokens: string;
  timestamp: string | Date;
  refundedAmount?: string;
  isRefunded?: boolean;
  // Optional explicit addresses when available in payloads
  cardinal_address?: string | null;
  ordinal_address?: string | null;
}

// Core auction config sent from backend
export interface AuctionConfig {
  totalTokens: string;
  ceilingMarketCapUSD: string;
  minPledgeBTC: string;
  maxPledgeBTC: string;
}

// Unified auction state consumed by the frontend UI
export interface AuctionState {
  id?: string;
  config: AuctionConfig;
  totalRaised: number;
  refundedBTC: number;
  currentMarketCap: number;
  ceilingMarketCap: number;
  ceilingReached: boolean;
  progressPercentage: number;
  currentPrice: number;
  priceError?: boolean;
  isActive?: boolean;
  isCompleted?: boolean;
  minPledge?: number;
  maxPledge?: number;
  timeRemaining: {
    hours: number;
    minutes: number;
    seconds: number;
  };
  // Milliseconds-since-epoch timestamps (optional; provided by backend when available)
  startTimeMs?: number;
  endTimeMs?: number;
  serverTimeMs?: number;
  recentActivity: AuctionActivity[];
}

// Payload for posting a pledge
export interface PledgeData {
  walletAddress: string;
  btcAmount: string;
  refundedAmount?: string;
}

export interface TimeRemaining {
  hours: number;
  minutes: number;
  seconds: number;
}

// Props for AuctionProgress component (UI-only; no refund fields)
export interface AuctionProgressProps {
  timeRemaining: TimeRemaining;
  totalRaised: number; // in BTC
  hardCap?: number; // in BTC
  // Synchronized timing fields (ms since epoch)
  startTimeMs?: number;
  endTimeMs?: number;
  serverTimeMs?: number;

  // Optional auxiliary fields (may be undefined depending on data source)
  currentMarketCap?: number; // in USD
  ceilingMarketCap?: number; // in USD
  ceilingReached?: boolean;

  progressPercentage: number;
  currentPrice: number; // token price in USD (or unit)
}
