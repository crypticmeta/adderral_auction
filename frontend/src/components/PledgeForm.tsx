// PledgeForm component for submitting BTC pledges
import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { Socket } from 'socket.io-client';

interface PledgeFormProps {
  isWalletConnected: boolean;
}

const PledgeForm: React.FC<PledgeFormProps> = ({ isWalletConnected }) => {
  const [btcAmount, setBtcAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [pledgeData, setPledgeData] = useState<any>(null);
  const [maxPledgeInfo, setMaxPledgeInfo] = useState<{
    minPledge: number;
    maxPledge: number;
    currentBTCPrice: number;
    minPledgeUSD: number;
    maxPledgeUSD: number;
  } | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  
  const { auctionState, isAuthenticated, socket } = useWebSocket();
  
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  
  // Fetch max pledge info (active auction) and refetch on real-time events
  useEffect(() => {
    const auctionId = auctionState?.id;
    if (!auctionId) return;

    const fetchMaxPledgeInfo = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/pledges/max-pledge/${auctionId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch max pledge info');
        }
        const data = await response.json();
        setMaxPledgeInfo(data);
      } catch (err) {
        console.error('Error fetching max pledge info:', err);
      }
    };

    fetchMaxPledgeInfo();

    if (socket) {
      const refetch = () => fetchMaxPledgeInfo();
      socket.on('pledge:queue:update', refetch);
      socket.on('pledge:created', refetch);
      socket.on('pledge:processed', refetch);
    }

    return () => {
      if (socket) {
        socket.off('pledge:queue:update');
        socket.off('pledge:created');
        socket.off('pledge:processed');
      }
    };
  }, [apiUrl, socket, auctionState?.id]);

  const handlePledge = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isWalletConnected) {
      setError('Please connect your wallet first');
      return;
    }
    
    if (!isAuthenticated) {
      setError('WebSocket authentication required');
      return;
    }
    
    const amount = parseFloat(btcAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid BTC amount');
      return;
    }
    
    if (maxPledgeInfo && (amount < maxPledgeInfo.minPledge || amount > maxPledgeInfo.maxPledge)) {
      setError(`Pledge amount must be between ${maxPledgeInfo.minPledge} and ${maxPledgeInfo.maxPledge} BTC`);
      return;
    }
    
    setIsLoading(true);
    setError('');
    setPledgeData(null);
    
    try {
      const token = localStorage.getItem('guestToken');
      
      if (!token) {
        throw new Error('Authentication token not found');
      }
      
      const response = await fetch(`${apiUrl}/api/auction/pledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ btcAmount: amount })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create pledge');
      }
      
      const data = await response.json();
      setPledgeData(data);
      setBtcAmount('');
      
      // Get queue position if available
      if (data.queuePosition) {
        setQueuePosition(data.queuePosition);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Mock function to simulate verifying a pledge with a transaction ID
  const handleVerifyPledge = async () => {
    if (!pledgeData) return;
    
    setIsLoading(true);
    
    try {
      const token = localStorage.getItem('guestToken');
      
      if (!token) {
        throw new Error('Authentication token not found');
      }
      
      // Generate a mock transaction ID
      const mockTxid = '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
      
      const response = await fetch(`${apiUrl}/api/auction/verify-pledge/${pledgeData.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ txid: mockTxid })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to verify pledge');
      }
      
      const data = await response.json();
      setPledgeData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const isAuctionActive = auctionState?.isActive ?? false;
  const belowMinCapacity = !!maxPledgeInfo && maxPledgeInfo.maxPledge < maxPledgeInfo.minPledge;
  const zeroCapacity = !!maxPledgeInfo && maxPledgeInfo.maxPledge <= 0;

  return (
    <div className="bg-gradient-to-br from-dark-800/50 to-dark-700/50 backdrop-blur-md border border-primary-500/30 rounded-xl p-6 transition-all hover:border-primary-500/60 hover:shadow-glow-md">
      <h2 className="text-2xl font-semibold mb-2 text-white">Make a Pledge</h2>
      <p className="text-gray-300 mb-6">
        Pledge BTC to secure your ACORN token allocation. First come, first served until ceiling is reached.
      </p>
      
      {auctionState?.ceilingReached && (
        <div className="bg-gradient-to-r from-amber-600/20 to-amber-700/20 border border-amber-500/30 text-amber-400 px-4 py-3 rounded-lg mb-4 text-sm">
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>Ceiling market cap reached. New pledges will be fully refunded.</span>
          </div>
        </div>
      )}
      
      {error && (
        <div className="bg-gradient-to-r from-red-600/20 to-red-700/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {(belowMinCapacity || zeroCapacity) && (
        <div className="bg-gradient-to-r from-amber-600/20 to-amber-700/20 border border-amber-500/30 text-amber-400 px-4 py-3 rounded-lg mb-4 text-sm">
          Remaining capacity is below the minimum pledge. Pledging is temporarily paused.
        </div>
      )}
      
      {pledgeData && !pledgeData.verified && (
        <div className="bg-gradient-to-r from-yellow-600/20 to-yellow-700/20 border border-yellow-500/30 text-yellow-400 px-4 py-3 rounded-lg mb-4 space-y-3">
          <h3 className="font-semibold">Payment Required</h3>
          <p className="text-sm">Please send {pledgeData.btcAmount} BTC to the address below:</p>
          <div className="bg-dark-900/50 p-3 rounded-lg break-all font-mono text-sm text-gray-300 border border-yellow-500/20">
            {pledgeData.depositAddress}
          </div>
          {queuePosition !== null && (
            <div className="mt-2 p-2 bg-blue-500/20 border border-blue-400/30 rounded-lg">
              <p className="text-blue-400 text-sm">
                <span className="font-semibold">Queue Position:</span> {queuePosition}
              </p>
            </div>
          )}
          <button
            onClick={handleVerifyPledge}
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-black py-2 px-4 rounded-lg hover:from-yellow-600 hover:to-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-yellow-500/25"
          >
            {isLoading ? 'Verifying...' : 'Verify Payment (Mock)'}
          </button>
        </div>
      )}
      
      {pledgeData && pledgeData.verified && (
        <div className="bg-gradient-to-r from-green-600/20 to-green-700/20 border border-green-500/30 text-green-400 px-4 py-3 rounded-lg mb-4">
          <h3 className="font-semibold mb-2">Pledge Verified!</h3>
          <p className="text-sm">Your pledge of {pledgeData.btcAmount} BTC is confirmed.</p>
          {pledgeData.refundedAmount > 0 && (
            <div className="mt-2 p-2 bg-amber-500/20 border border-amber-400/30 rounded-lg">
              <p className="text-amber-400 text-sm">
                <span className="font-semibold">Note:</span> {pledgeData.refundedAmount} BTC has been refunded as the ceiling market cap was reached.
              </p>
            </div>
          )}
          <p className="text-xs mt-2 text-gray-400">TxID: <span className="font-mono break-all">{pledgeData.txid}</span></p>
        </div>
      )}
      
      <form onSubmit={handlePledge} className="space-y-4">
        <div>
          <label htmlFor="btcAmount" className="block text-sm font-medium text-gray-400 mb-2">
            BTC Amount
          </label>
          <div className="relative">
            <input
              type="number"
              id="btcAmount"
              value={btcAmount}
              onChange={(e) => setBtcAmount(e.target.value)}
              step="0.001"
              min={maxPledgeInfo ? String(maxPledgeInfo.minPledge) : undefined}
              max={maxPledgeInfo ? String(maxPledgeInfo.maxPledge) : undefined}
              className="w-full px-3 py-2 bg-dark-900/50 border border-primary-500/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 pr-12 text-gray-200 placeholder-gray-500"
              placeholder="0.01"
              required
              disabled={!isWalletConnected || !isAuctionActive || isLoading || (pledgeData && !pledgeData.verified) || belowMinCapacity || zeroCapacity}
            />
            <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-400 text-sm">
              BTC
            </div>
          </div>
          {maxPledgeInfo && (
            <p className="text-xs text-gray-500 mt-1.5">
              Min: {maxPledgeInfo.minPledge} BTC | Max: {maxPledgeInfo.maxPledge} BTC | Current BTC Price: ${maxPledgeInfo.currentBTCPrice.toLocaleString()}
            </p>
          )}
        </div>
        
        <button
          type="submit"
          disabled={!isWalletConnected || !isAuctionActive || isLoading || !!pledgeData || belowMinCapacity || zeroCapacity}
          className="w-full bg-gradient-to-r from-primary-500 to-primary-600 text-white py-2.5 px-4 rounded-lg hover:from-primary-600 hover:to-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-primary-500/25 font-medium"
        >
          {isLoading ? 'Processing...' : 'Pledge Now'}
        </button>
        
        {!isAuctionActive && (
          <p className="text-center text-sm text-red-400 mt-2">
            The auction has ended. No more pledges can be made.
          </p>
        )}
      </form>
    </div>
  );
};

export default PledgeForm;
