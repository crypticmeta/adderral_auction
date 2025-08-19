// Auction status component with real-time updates from WebSocket
import React from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';

const AuctionStatus: React.FC = () => {
  const { auctionStatus, isConnected } = useWebSocket();

  // Format remaining time
  const formatRemainingTime = (milliseconds: number): string => {
    if (!milliseconds) return '00:00:00';
    
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Format BTC amount
  const formatBTC = (amount: number): string => {
    if (amount === undefined || amount === null || isNaN(amount)) {
      return '0.00000000';
    }
    return amount.toFixed(8);
  };

  // Format USD amount
  const formatUSD = (amount: number): string => {
    if (amount === undefined || amount === null || isNaN(amount)) {
      return '$0.00';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Calculate progress percentage toward ceiling market cap
  const calculateProgress = (): number => {
    if (!auctionStatus || !auctionStatus.currentMarketCap || !auctionStatus.ceilingMarketCap) return 0;
    return Math.min(100, (auctionStatus.currentMarketCap / auctionStatus.ceilingMarketCap) * 100);
  };

  if (!isConnected) {
    return (
      <div className="bg-gradient-to-br from-dark-800/50 to-dark-700/50 backdrop-blur-md border border-primary-500/30 rounded-xl p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Connecting to auction...</p>
        </div>
      </div>
    );
  }

  if (!auctionStatus) {
    return (
      <div className="bg-gradient-to-br from-dark-800/50 to-dark-700/50 backdrop-blur-md border border-primary-500/30 rounded-xl p-6">
        <div className="text-center py-8">
          <p className="text-gray-400">Loading auction data...</p>
        </div>
      </div>
    );
  }

  const progress = calculateProgress();

  return (
    <div className="bg-gradient-to-br from-dark-800/50 to-dark-700/50 backdrop-blur-md border border-primary-500/30 rounded-xl p-6 transition-all hover:border-primary-500/60 hover:shadow-glow-md">
      <h2 className="text-2xl font-semibold mb-6 text-white">Auction Status</h2>
      
      {/* Auction status banner */}
      <div className={`mb-6 p-4 rounded-lg ${auctionStatus.isActive ? 'bg-gradient-to-r from-green-600/20 to-green-700/20 border border-green-500/30 text-green-400' : 'bg-gradient-to-r from-red-600/20 to-red-700/20 border border-red-500/30 text-red-400'}`}>
        <div className="flex items-center">
          <div className={`h-3 w-3 rounded-full mr-3 ${auctionStatus.isActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          <span className="font-medium">
            {auctionStatus.isActive ? 'Auction is Active' : 'Auction has Ended'}
          </span>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between mb-2">
          <span className="text-sm font-medium text-gray-400">
            {formatUSD(auctionStatus.currentMarketCap)} / {formatUSD(auctionStatus.ceilingMarketCap)}
          </span>
          <span className="text-sm font-medium text-white">{progress.toFixed(2)}%</span>
        </div>
        <div className="w-full bg-dark-900/50 rounded-full h-3 overflow-hidden">
          <div 
            className="bg-gradient-to-r from-primary-500 to-accent-pink h-3 rounded-full transition-all duration-500 relative"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
          </div>
        </div>
      </div>
      
      {/* Time remaining & Price */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
        <div className="bg-gradient-to-br from-dark-900/50 to-dark-800/50 p-4 rounded-lg border border-primary-500/20">
          <h3 className="text-sm font-medium text-gray-400 mb-1">Time Remaining</h3>
          <p className="text-2xl font-bold bg-gradient-to-r from-primary-400 to-accent-pink bg-clip-text text-transparent">
            {auctionStatus.isActive ? formatRemainingTime(auctionStatus.remainingTime) : '00:00:00'}
          </p>
        </div>
        <div className="bg-gradient-to-br from-dark-900/50 to-dark-800/50 p-4 rounded-lg border border-primary-500/20">
          <h3 className="text-sm font-medium text-gray-400 mb-1">Current Token Price</h3>
          <p className="text-2xl font-bold bg-gradient-to-r from-accent-blue to-accent-cyan bg-clip-text text-transparent">
            ${auctionStatus.currentPrice ? auctionStatus.currentPrice.toFixed(8) : '0.00000000'}
          </p>
        </div>
      </div>
      
      {/* Auction details */}
      <div className="border-t border-primary-500/20 pt-6">
        <h3 className="text-lg font-semibold mb-4 text-white">Auction Details</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="text-gray-400">Total Tokens for Sale</div>
          <div className="font-medium text-right text-gray-200">{auctionStatus.totalTokens ? auctionStatus.totalTokens.toLocaleString() : '0'}</div>
          
          <div className="text-gray-400">Ceiling Market Cap</div>
          <div className="font-medium text-right text-gray-200">{formatUSD(auctionStatus.ceilingMarketCap)}</div>
          
          <div className="text-gray-400">Current Market Cap</div>
          <div className="font-medium text-right text-gray-200">{formatUSD(auctionStatus.currentMarketCap)}</div>
          
          <div className="text-gray-400">Total BTC Pledged</div>
          <div className="font-medium text-right text-gray-200">{formatBTC(auctionStatus.totalBTCPledged)} BTC</div>
          
          {auctionStatus.refundedBTC > 0 && (
            <>
              <div className="text-gray-400">Refunded BTC</div>
              <div className="font-medium text-right text-gray-200">{formatBTC(auctionStatus.refundedBTC)} BTC</div>
            </>
          )}
          
          <div className="text-gray-400">Minimum Pledge</div>
          <div className="font-medium text-right text-gray-200">{formatBTC(auctionStatus.minPledge)} BTC</div>
          
          <div className="text-gray-400">Maximum Pledge</div>
          <div className="font-medium text-right text-gray-200">{formatBTC(auctionStatus.maxPledge)} BTC</div>
          
          {auctionStatus.ceilingReached && (
            <div className="col-span-2 mt-2 p-2 bg-gradient-to-r from-amber-600/20 to-amber-700/20 border border-amber-500/30 text-amber-400 rounded-lg text-center">
              <span className="font-medium">Ceiling Market Cap Reached</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuctionStatus;
