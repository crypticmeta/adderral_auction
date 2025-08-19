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
    config: AuctionConfig;
    totalRaised: number;
    refundedBTC: number;
    currentMarketCap: number;
    ceilingMarketCap: number;
    ceilingReached: boolean;
    progressPercentage: number;
    currentPrice: number;
    timeRemaining: {
        hours: number;
        minutes: number;
        seconds: number;
    };
    recentActivity: AuctionActivity[];
}

export interface PledgeData {
    walletAddress: string;
    btcAmount: string;
    refundedAmount?: string;
}
