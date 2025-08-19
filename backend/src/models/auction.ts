export interface Pledge {
  id: string;
  guestId: string;
  btcAmount: number;
  depositAddress: string;
  txid?: string;
  timestamp: Date;
  verified: boolean;
}

export interface AuctionState {
  totalTokens: number;
  ceilingMarketCap: number; // Ceiling market cap in USD
  totalBTCPledged: number;
  startTime: Date;
  endTime: Date;
  isActive: boolean;
  isCompleted: boolean;
  minPledge: number;
  maxPledge: number;
  pledges: Pledge[];
  refundedPledges: Pledge[]; // Pledges that came in after ceiling was reached
}

// Initial auction state based on the requirements
const auctionDuration = 72 * 60 * 60 * 1000; // 72 hours in milliseconds

export const auction: AuctionState = {
  totalTokens: 100_000_000, // 10% of total supply (1 billion)
  ceilingMarketCap: 15_000_000, // $15 million ceiling market cap
  totalBTCPledged: 0,
  startTime: new Date(),
  endTime: new Date(Date.now() + auctionDuration),
  isActive: true,
  isCompleted: false,
  minPledge: 0.001, // Minimum pledge amount
  maxPledge: 0.5, // Maximum pledge amount
  pledges: [],
  refundedPledges: []
};

// BTC price in USD - in a real implementation this would come from an API
const BTC_PRICE_USD = 60000;

// Calculate current market cap based on BTC raised
const calculateCurrentMarketCap = (): number => {
  return auction.totalBTCPledged * BTC_PRICE_USD;
};

// Check if adding this pledge would exceed the ceiling
const wouldExceedCeiling = (btcAmount: number): boolean => {
  const potentialMarketCap = (auction.totalBTCPledged + btcAmount) * BTC_PRICE_USD;
  return potentialMarketCap > auction.ceilingMarketCap;
};

export const addPledge = (pledge: Omit<Pledge, 'id' | 'timestamp' | 'verified'>): Pledge => {
  const newPledge: Pledge = {
    ...pledge,
    id: Date.now().toString(),
    timestamp: new Date(),
    verified: false
  };
  
  // FCFS implementation - check if ceiling would be reached
  if (!auction.isCompleted && wouldExceedCeiling(pledge.btcAmount)) {
    // This pledge would exceed the ceiling, add to refunded pledges
    auction.refundedPledges.push(newPledge);
    return newPledge;
  }
  
  // Add pledge normally
  auction.pledges.push(newPledge);
  auction.totalBTCPledged += pledge.btcAmount;
  
  // Check if ceiling is reached after adding this pledge
  if (calculateCurrentMarketCap() >= auction.ceilingMarketCap) {
    completeAuction();
  }
  
  return newPledge;
};

export const verifyPledge = (pledgeId: string, txid: string): Pledge | undefined => {
  const pledgeIndex = auction.pledges.findIndex(pledge => pledge.id === pledgeId);
  if (pledgeIndex === -1) return undefined;
  
  auction.pledges[pledgeIndex] = {
    ...auction.pledges[pledgeIndex],
    txid,
    verified: true
  };
  
  return auction.pledges[pledgeIndex];
};

export const completeAuction = (): void => {
  auction.isActive = false;
  auction.isCompleted = true;
  auction.endTime = new Date();
};

export const calculateTokenPrice = (): number => {
  // Calculate price based on current market cap
  const currentMarketCap = calculateCurrentMarketCap();
  return currentMarketCap / auction.totalTokens;
};

export const calculateGuestAllocation = (guestId: string): number => {
  // Get only verified pledges for this guest that weren't refunded
  const guestPledges = auction.pledges.filter(pledge => pledge.guestId === guestId && pledge.verified);
  const totalGuestBTC = guestPledges.reduce((sum, pledge) => sum + pledge.btcAmount, 0);
  
  // Calculate token allocation based on BTC contribution
  const tokenPrice = calculateTokenPrice();
  return totalGuestBTC * BTC_PRICE_USD / tokenPrice;
};

// Check if a guest has any refunded pledges
export const hasRefundedPledges = (guestId: string): boolean => {
  return auction.refundedPledges.some(pledge => pledge.guestId === guestId);
};

// Get refunded amount for a guest
export const getRefundAmount = (guestId: string): number => {
  const refundedPledges = auction.refundedPledges.filter(pledge => pledge.guestId === guestId);
  return refundedPledges.reduce((sum, pledge) => sum + pledge.btcAmount, 0);
};

export const getAuctionStatus = (): {
  isActive: boolean;
  isCompleted: boolean;
  totalBTCPledged: number;
  remainingTime: number;
  currentPrice: number;
  currentMarketCap: number;
  ceilingReached: boolean;
  refundedPledges: number;
} => {
  const now = new Date();
  const remainingTime = Math.max(0, auction.endTime.getTime() - now.getTime());
  const currentMarketCap = calculateCurrentMarketCap();
  
  // Check if auction should be completed due to time
  if (auction.isActive && remainingTime <= 0) {
    completeAuction();
  }
  
  return {
    isActive: auction.isActive,
    isCompleted: auction.isCompleted,
    totalBTCPledged: auction.totalBTCPledged,
    remainingTime,
    currentPrice: calculateTokenPrice(),
    currentMarketCap,
    ceilingReached: currentMarketCap >= auction.ceilingMarketCap,
    refundedPledges: auction.refundedPledges.length
  };
};
