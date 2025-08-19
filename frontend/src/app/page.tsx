// File: page.tsx - Homepage UI: header, hero, stats, auction interface, scenarios, activity, and footer
"use client";

import { useState, useEffect } from 'react';
import { AuctionStats } from '@/components/auction-stats';
import { AuctionProgress } from '@/components/auction-progress';
import { RecentActivity } from '@/components/recent-activity';
import PledgeContainer from '@/components/PledgeContainer';
import { useWebSocket } from '@/hooks/use-websocket';
import { ConnectMultiButton } from 'bitcoin-wallet-adapter';

export default function Home() {
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  // Use our WebSocket hook for auction data
  const { auctionState, isConnected, error } = useWebSocket();

  // Load wallet connection state from localStorage on component mount
  useEffect(() => {
    // Check if running in browser environment
    if (typeof window !== 'undefined') {
      const storedWalletConnected = localStorage.getItem('walletConnected') === 'true';
      const storedWalletAddress = localStorage.getItem('walletAddress') || '';

      if (storedWalletConnected && storedWalletAddress) {
        setIsWalletConnected(true);
        setWalletAddress(storedWalletAddress);
      }
    }
  }, [])

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
      // Simple API call for dev mode only
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/auction/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setResetMessage(data.message || 'Auction reset successfully');
        // Reload the page to reflect changes
        window.location.reload();
      } else {
        throw new Error('Failed to reset auction');
      }
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
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-acorn-400 to-acorn-600 bg-clip-text text-transparent">ACORN FCFS Auction</h1>

          {error ? (
            <>
              <p className="text-red-400 mb-2">Connection issue: {error}</p>
              <p className="text-gray-400 mb-4">Using demo data for preview</p>
            </>
          ) : (
            <p className="text-gray-400 mb-4">Connecting to auction...</p>
          )}

          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-acorn-500 mx-auto"></div>
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

      {/* Header */}
      <header className="relative z-50 p-6">
        <nav className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Logo */}
          <div className="flex items-center justify-center space-x-4">
            <div className="w-12 h-12 rounded-full overflow-hidden">
              <img src="/acorn.png" alt="ACORN Token Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold">
                ACORN
              </h1>
              <p className="text-sm text-gray-400">by Adderrels</p>
            </div>
          </div>

          {/* Admin Reset Button */}
          {isAdmin && (
            <button
              onClick={handleResetAuction}
              disabled={isResetting}
              className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-md hover:from-red-700 hover:to-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-red-500/25 mr-4"
            >
              {isResetting ? 'Resetting...' : 'Reset Auction'}
            </button>
          )}

          {/* implement bitcoin wallet adapter Multiwalletbutton component */}
          <ConnectMultiButton
            network="mainnet"
            connectionMessage='Connect your wallet to participate in the auction.'
            // buttonClassname="w-full bg-primary text-primary-foreground py-2.5 px-4 rounded-md hover:bg-primary/80 focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            // modalContainerClass="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            // modalContentClass="bg-card rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6"
            supportedWallets={["unisat", "xverse", "leather", "magiceden", "okx"]}
            onSignatureCapture={(signatureData) => {
              console.log('Signature captured:', signatureData);
              // You can use this data for additional verification if needed
            }}
          />
        </nav>
      </header>

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
              <span className="bg-gradient-to-r from-white via-acorn-400 to-acorn-600 bg-clip-text text-transparent">
                ACORN
              </span>
            </h1>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-300 mb-2">First Come, First Served Auction</h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Join the ACORN token FCFS auction. {totalTokensM}M tokens available with a ceiling market cap of $15M.
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
      <footer className="relative z-10 border-t border-gray-800 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <div className="flex items-center justify-center space-x-4 mb-4">
            <div className="w-8 h-8 bg-gradient-to-r from-acorn-500 to-acorn-600 rounded-full p-1.5">
              <img src="/acorn.png" alt="ACORN" className="w-full h-full object-contain" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-acorn-400 to-acorn-600 bg-clip-text text-transparent">
              ACORN by Adderrels
            </span>
          </div>
          <p className="text-gray-400 text-sm">
            © 2024 Adderrels. All rights reserved. Participate responsibly in cryptocurrency auctions.
          </p>

          {resetMessage && (
            <p className={`mt-2 text-sm ${resetMessage.includes('success') ? 'text-green-500' : 'text-red-500'}`}>
              {resetMessage}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
