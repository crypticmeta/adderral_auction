// Auction status component with real-time updates from WebSocket
import React from 'react';
import { CountdownTimer } from './countdown-timer';
import { useWebSocket } from '@/hooks/use-websocket';

const AuctionStatus: React.FC = () => {
  const { auctionState, isConnected } = useWebSocket();

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
    if (!auctionState) return 0;
    if (typeof auctionState.progressPercentage === 'number') return auctionState.progressPercentage;
    if (auctionState.currentMarketCap && auctionState.ceilingMarketCap) {
      return Math.min(100, (auctionState.currentMarketCap / auctionState.ceilingMarketCap) * 100);
    }
    return 0;
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

  if (!auctionState) {
    return (
      <div className="bg-gradient-to-br from-dark-800/50 to-dark-700/50 backdrop-blur-md border border-primary-500/30 rounded-xl p-6">
        <div className="text-center py-8">
          <p className="text-gray-400">Loading auction data...</p>
        </div>
      </div>
    );
  }

  const progress = calculateProgress();
  const nowMsAS = typeof auctionState.serverTimeMs === 'number'
    ? (auctionState.serverTimeMs as number)
    : (typeof window !== 'undefined' ? Date.now() : 0);
  const isPreStart = typeof auctionState.startTimeMs === 'number'
    ? nowMsAS < (auctionState.startTimeMs as number)
    : false;

  return (
    <div className="bg-gradient-to-br from-dark-800/50 to-dark-700/50 backdrop-blur-md border border-primary-500/30 rounded-xl p-6 transition-all hover:border-primary-500/60 hover:shadow-glow-md">
      <h2 className="text-2xl font-semibold mb-6 text-white">Auction Status</h2>
      
      {/* Auction status banner */}
      <div className={`mb-6 p-4 rounded-lg ${isPreStart
        ? 'bg-gradient-to-r from-amber-600/20 to-amber-700/20 border border-amber-500/30 text-amber-300'
        : auctionState.isActive
          ? 'bg-gradient-to-r from-green-600/20 to-green-700/20 border border-green-500/30 text-green-400'
          : 'bg-gradient-to-r from-red-600/20 to-red-700/20 border border-red-500/30 text-red-400'}`}>
        <div className="flex items-center">
          <div className={`h-3 w-3 rounded-full mr-3 ${isPreStart ? 'bg-amber-400 animate-pulse' : auctionState.isActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          <span className="font-medium">
            {isPreStart ? 'Auction Starts Soon' : auctionState.isActive ? 'Auction is Active' : 'Auction has Ended'}
          </span>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="mb-6">
        {isPreStart ? (
          <div className="text-center text-gray-500 text-sm py-6 border border-dashed border-gray-700 rounded-xl">
            Progress will appear when the auction starts.
          </div>
        ) : (
          <>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium text-gray-400">
                {formatUSD(auctionState.currentMarketCap)} / {formatUSD(auctionState.ceilingMarketCap)}
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
          </>
        )}
      </div>
      
      {/* Time remaining or Starts In & Price */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
        <div className="bg-gradient-to-br from-dark-900/50 to-dark-800/50 p-4 rounded-lg border border-primary-500/20">
          <h3 className="text-sm font-medium text-gray-400 mb-3">{isPreStart ? 'Starts In' : 'Time Remaining'}</h3>
          <CountdownTimer
            timeRemaining={auctionState.timeRemaining}
            startTimeMs={auctionState.startTimeMs}
            endTimeMs={auctionState.endTimeMs}
            serverTimeMs={auctionState.serverTimeMs}
          />
        </div>
        <div className="bg-gradient-to-br from-dark-900/50 to-dark-800/50 p-4 rounded-lg border border-primary-500/20">
          <h3 className="text-sm font-medium text-gray-400 mb-1">Current Token Price</h3>
          <p className="text-2xl font-bold bg-gradient-to-r from-accent-blue to-accent-cyan bg-clip-text text-transparent">
            ${typeof auctionState.currentPrice === 'number' ? auctionState.currentPrice.toFixed(8) : '0.00000000'}
          </p>
        </div>
      </div>
      
      {/* Auction details */}
      <div className="border-t border-primary-500/20 pt-6">
        <h3 className="text-lg font-semibold mb-4 text-white">Auction Details</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="text-gray-400">Tokens On Sale</div>
          <div className="font-medium text-right text-gray-200">
            {(() => {
              const ts = auctionState.config?.tokensOnSale ?? auctionState.config?.totalTokens;
              const n = ts ? Number(ts) : 0;
              return Number.isFinite(n) ? n.toLocaleString() : '0';
            })()}
          </div>

          <div className="text-gray-400">Total Supply</div>
          <div className="font-medium text-right text-gray-200">{auctionState.config?.totalTokens ? Number(auctionState.config.totalTokens).toLocaleString() : '0'}</div>
          
          <div className="text-gray-400">Ceiling Market Cap</div>
          <div className="font-medium text-right text-gray-200">{formatUSD(auctionState.ceilingMarketCap)}</div>
          
          <div className="text-gray-400">Current Market Cap</div>
          <div className="font-medium text-right text-gray-200">{formatUSD(auctionState.currentMarketCap)}</div>
          
          <div className="text-gray-400">Total BTC Pledged</div>
          <div className="font-medium text-right text-gray-200">{formatBTC(auctionState.totalRaised)} BTC</div>
          
          {typeof auctionState.refundedBTC === 'number' && auctionState.refundedBTC > 0 && (
            <>
              <div className="text-gray-400">Refunded BTC</div>
              <div className="font-medium text-right text-gray-200">{formatBTC(auctionState.refundedBTC)} BTC</div>
            </>
          )}
          
          <div className="text-gray-400">Minimum Pledge</div>
          <div className="font-medium text-right text-gray-200">{formatBTC(typeof auctionState.minPledge === 'number' ? auctionState.minPledge : parseFloat(auctionState.config?.minPledgeBTC ?? '0'))} BTC</div>
          
          <div className="text-gray-400">Maximum Pledge</div>
          <div className="font-medium text-right text-gray-200">{formatBTC(typeof auctionState.maxPledge === 'number' ? auctionState.maxPledge : parseFloat(auctionState.config?.maxPledgeBTC ?? '0'))} BTC</div>
          
          {auctionState.ceilingReached && (
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
