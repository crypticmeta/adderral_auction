// Types for the auction system
export interface AuctionActivity {
    id: string;
    walletAddress: string;
    btcAmount: string;
    estimatedTokens: string;
    timestamp: string | Date;
    refundedAmount?: string;
    isRefunded?: boolean;
}

export interface AuctionConfig {
    totalTokens: string;
    ceilingMarketCapUSD: string;
    minPledgeBTC: string;
    maxPledgeBTC: string;
}

export interface AuctionState {
    // Active auction identifier (from backend WS payload)
    id?: string;
    config: AuctionConfig;
    totalRaised: number;
    refundedBTC: number;
    currentMarketCap: number;
    ceilingMarketCap: number;
    ceilingReached: boolean;
    progressPercentage: number;
    currentPrice: number;
    // If true, backend couldn't fetch BTC price; disable pledge UI
    priceError?: boolean;
    // Optional raw controls from server for convenience/null-safe checks
    isActive?: boolean;
    isCompleted?: boolean;
    minPledge?: number;
    maxPledge?: number;
    timeRemaining: {
        hours: number;
        minutes: number;
        seconds: number;
    };
    // Synchronized timing fields from server (ms since epoch)
    // Used by countdown-timer to tick consistently across clients
    endTimeMs?: number;
    serverTimeMs?: number;
    recentActivity: AuctionActivity[];
}

export interface PledgeData {
    walletAddress: string;
    btcAmount: string;
    refundedAmount?: string;
}

// Shared UI types
// Time remaining payload used by countdowns
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
  endTimeMs?: number;
  serverTimeMs?: number;

  // Optional auxiliary fields (may be undefined depending on data source)
  currentMarketCap?: number; // in USD
  ceilingMarketCap?: number; // in USD
  ceilingReached?: boolean;

  progressPercentage: number;
  currentPrice: number; // token price in USD (or unit)
}
