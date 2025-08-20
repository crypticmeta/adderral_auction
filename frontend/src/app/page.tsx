// File: page.tsx - Homepage UI: header, hero, stats, auction interface, scenarios, activity, and footer
"use client";

import { useState, useEffect } from 'react';
import { AuctionStats } from '@/components/auction-stats';
import { AuctionProgress } from '@/components/auction-progress';
import { RecentActivity } from '@/components/recent-activity';
import PledgeContainer from '@/components/PledgeContainer';
import { useWebSocket } from '@/hooks/use-websocket';
import { ConnectMultiButton } from 'bitcoin-wallet-adapter';
import http from '@/lib/http';
import { useWalletAddress } from 'bitcoin-wallet-adapter';

export default function Home() {
  // Derive wallet connection from adapter (no localStorage)
  const wallet = useWalletAddress();
  const isWalletConnected = wallet?.connected ?? false;
  const walletAddress = wallet?.cardinal_address ?? '';
  const [isAdmin, setIsAdmin] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  // Use our WebSocket hook for auction data
  const { auctionState, isConnected, error } = useWebSocket();

  // Note: Wallet connection is managed by the adapter; no localStorage fallbacks

  // In dev mode, show reset button for any connected wallet
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkDevMode = () => {
      // Check if we're in development mode using environment variable or localhost check
      const isDev = process.env.NEXT_PUBLIC_APP_ENV === 'development';
      const isLocalhost = window.location.hostname === 'localhost';

      // Show admin controls in development environment or on localhost
      if ((isDev || isLocalhost) && isWalletConnected) {
        setIsAdmin(true);
      }
    };

    if (isWalletConnected) {
      checkDevMode();
    }
  }, [isWalletConnected]);

  const handleResetAuction = async () => {
    if (!window.confirm('Are you sure you want to reset the auction? This will clear all pledges and restart the auction.')) {
      return;
    }

    setIsResetting(true);
    setResetMessage('');

    try {
      // Dev-only reset via safe http wrapper (relative path enforced)
      const response = await http.post('/auction/reset', {});
      const data = response?.data as { message?: string } | undefined;
      setResetMessage(data?.message || 'Auction reset successfully');
      // Reload the page to reflect changes
      window.location.reload();
    } catch (error) {
      console.error('Error resetting auction:', error);
      setResetMessage('Failed to reset auction. Please try again.');
    } finally {
      setIsResetting(false);
    }
  };

  // Loading screen when WebSocket is connecting or auction data is not available
  if (!auctionState) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-adderrels-400 to-adderrels-600 bg-clip-text text-transparent">ADDERRELS FCFS Auction</h1>

          {error ? (
            <>
              <p className="text-red-400 mb-2">Connection issue: {error}</p>
            </>
          ) : (
            <p className="text-gray-400 mb-4">Connecting to auction...</p>
          )}

          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-adderrels-500 mx-auto"></div>
        </div>
      </div>
    );
  }

  const { config, totalRaised, refundedBTC, currentMarketCap, ceilingMarketCap, ceilingReached, progressPercentage, currentPrice, timeRemaining, endTimeMs, serverTimeMs, recentActivity } = auctionState;

  // Null-safe derived values
  const totalTokensM = config?.totalTokens ? parseInt(config.totalTokens) / 1_000_000 : 0;
  const currentMarketCapM = typeof currentMarketCap === 'number' ? (currentMarketCap / 1_000_000) : 0;

  return (
    <div className="font-inter bg-dark-950 text-white overflow-x-hidden min-h-screen">
      {/* Background with Banner */}
      <div className="fixed inset-0 z-0">
        <div
          className="absolute inset-0 banner-image opacity-90"
          style={{ backgroundImage: `url(/banner.png)` }}
        />
        <div className="absolute inset-0 gradient-bg opacity-95" />
        <div className="absolute inset-0 banner-overlay" />
      </div>

      {/* Main Content */}
      <main className="relative z-10 min-h-screen pt-8 pb-16 section-gradient">
        {/* decorative orbs */}
        <span
          className="orb w-64 h-64 absolute -top-10 -left-10"
          style={{ background: 'radial-gradient(circle at center, rgba(249,115,22,0.35), transparent 60%)' }}
        />
        <span
          className="orb w-64 h-64 absolute top-10 -right-10"
          style={{ background: 'radial-gradient(circle at center, rgba(168,85,247,0.28), transparent 60%)' }}
        />
        <div className="max-w-6xl mx-auto px-6">

          {/* Hero Section */}
          <div className="text-center mb-12 animate-float">
            <h1 className="text-5xl md:text-7xl font-black mb-4">
              <span className="bg-gradient-to-r from-white via-adderrels-400 to-adderrels-600 bg-clip-text text-transparent">
                ADDERRELS
              </span>
            </h1>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-300 mb-2">First Come, First Served Auction</h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Join the ADDERRELS token FCFS auction. {totalTokensM}M tokens available with a ceiling market cap of $15M.
            </p>
          </div>

          {/* Auction Stats */}
          <AuctionStats
            totalTokens={(totalTokensM).toString()}
            ceilingMarketCap="15"
            currentMarketCap={currentMarketCapM.toFixed(2)}
            duration="72"
            totalRaisedBTC={typeof totalRaised === 'number' ? totalRaised : 0}
          />

          {/* Main Auction Interface */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <AuctionProgress
              timeRemaining={timeRemaining}
              endTimeMs={endTimeMs}
              serverTimeMs={serverTimeMs}
              totalRaised={totalRaised}
              refundedBTC={refundedBTC}
              currentMarketCap={currentMarketCap}
              ceilingMarketCap={ceilingMarketCap}
              ceilingReached={ceilingReached}
              progressPercentage={progressPercentage}
              currentPrice={currentPrice}
            />

            <PledgeContainer
              isWalletConnected={isWalletConnected}
            />
          </div>

          {/* Auction Scenarios */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="glass-card p-6 rounded-2xl border-l-4 border-green-500">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center mr-3">
                  <span className="text-white font-bold">1</span>
                </div>
                <h3 className="text-xl font-bold text-green-400">Ceiling Market Cap Reached</h3>
              </div>
              <p className="text-gray-300 mb-3">
                If $15M market cap is reached before 72 hours, the auction ends immediately.
              </p>
              <p className="text-sm text-gray-400">
                Pledges that would exceed the ceiling are partially or fully refunded. Token price locked at $15M valuation.
              </p>
            </div>

            <div className="glass-card p-6 rounded-2xl border-l-4 border-purple-500">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center mr-3">
                  <span className="text-white font-bold">2</span>
                </div>
                <h3 className="text-xl font-bold text-purple-400">Time-Based End</h3>
              </div>
              <p className="text-gray-300 mb-3">
                If ceiling market cap isn't reached, auction ends after 72 hours.
              </p>
              <p className="text-sm text-gray-400">
                Final token price determined by total BTC raised (minus refunds) ÷ {totalTokensM}M tokens.
              </p>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="mt-12">
            <RecentActivity
              activities={recentActivity || []}
              isConnected={isConnected}
            />
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-20 mt-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="glass-card bg-dark-900/70 backdrop-blur border border-white/10 rounded-t-2xl px-6 py-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 bg-gradient-to-r from-adderrels-500 to-adderrels-600 rounded-full p-1.5 overflow-hidden">
                  <img src="/adderrel.png" alt="Adderrels" className="w-full h-full object-contain" />
                </div>
                <span className="text-lg sm:text-xl font-bold bg-gradient-to-r from-adderrels-400 to-adderrels-600 bg-clip-text text-transparent">
                  ADDERRELS by Adderrels
                </span>
              </div>

              <p className="text-gray-400 text-xs sm:text-sm text-center sm:text-right">
                © 2025 Adderrels. All rights reserved. Participate responsibly in cryptocurrency auctions.
              </p>
            </div>

            {resetMessage && (
              <p className={`mt-3 text-sm text-center ${resetMessage.includes('success') ? 'text-green-500' : 'text-red-500'}`}>
                {resetMessage}
              </p>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
