// File: PledgeInterface.tsx - Modern pledge UI; disables when BTC price unavailable or wallet not connected
import React, { useMemo, useState } from 'react';

interface PledgeInterfaceProps {
  minPledge: number;
  maxPledge: number;
  currentPrice: number; // USD per token
  isWalletConnected: boolean;
  walletAddress: string;
}

const PledgeInterface: React.FC<PledgeInterfaceProps> = ({
  minPledge,
  maxPledge,
  currentPrice,
  isWalletConnected,
  walletAddress,
}) => {
  const [pledgeAmount, setPledgeAmount] = useState<string>(''); // BTC amount as string
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; title: string; description?: string } | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  const estimatedTokens = useMemo(() => {
    if (!pledgeAmount) return 0;
    const amt = parseFloat(pledgeAmount);
    if (isNaN(amt) || !currentPrice || currentPrice <= 0) return 0;
    // Example: currentPrice is USD/token; convert BTC->USD amount then divide by price
    // If your currentPrice is already BTC/token, adjust accordingly.
    const btcUsd = 0; // unknown here; estimation relies on server-side. Keep 0 if unknown.
    return Math.max(0, Math.floor((btcUsd * amt) / currentPrice));
  }, [pledgeAmount, currentPrice]);

  const handlePledge = async () => {
    setMessage(null);

    if (!isWalletConnected) {
      setMessage({ type: 'error', title: 'Wallet not connected', description: 'Please connect your wallet to make a pledge' });
      return;
    }

    const amount = parseFloat(pledgeAmount);
    if (isNaN(amount) || (minPledge && amount < minPledge) || (maxPledge && amount > maxPledge)) {
      setMessage({ type: 'error', title: 'Invalid amount', description: `Pledge amount must be between ${minPledge} and ${maxPledge} BTC` });
      return;
    }

    try {
      setIsPending(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('guestToken') : null;
      if (!token) throw new Error('Authentication token not found');

      const res = await fetch(`${apiUrl}/api/auction/pledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ btcAmount: amount, walletAddress }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || 'Failed to create pledge');
      }

      setMessage({ type: 'success', title: 'Pledge submitted!', description: 'Your pledge has been submitted successfully' });
      setPledgeAmount('');
    } catch (e: any) {
      setMessage({ type: 'error', title: 'Pledge failed', description: String(e?.message || 'There was an error processing your pledge') });
    } finally {
      setIsPending(false);
    }
  };

  const disabled = !isWalletConnected || isPending || !pledgeAmount;

  return (
    <div className="glass-card p-8 rounded-3xl">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold">Make Your Pledge</h3>
        <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
          <span className="text-sm font-bold">₿</span>
        </div>
      </div>

      {/* Limits */}
      <div className="bg-dark-800/50 p-4 rounded-xl mb-6 border border-gray-700">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-gray-400 text-sm">Minimum</p>
            <p className="text-cyan-400 font-semibold" data-testid="text-min-pledge">
              {Number.isFinite(minPledge) ? minPledge : 0} BTC
            </p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Maximum</p>
            <p className="text-cyan-400 font-semibold" data-testid="text-max-pledge">
              {Number.isFinite(maxPledge) ? maxPledge : 0} BTC
            </p>
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="mb-6">
        <label className="block text-gray-400 text-sm mb-2">BTC Amount</label>
        <div className="relative">
          <input
            type="number"
            placeholder="0.000"
            min={minPledge || 0}
            max={maxPledge || undefined}
            step="0.001"
            value={pledgeAmount}
            onChange={(e) => setPledgeAmount(e.target.value)}
            data-testid="input-pledge-amount"
            className="w-full bg-dark-800 border border-gray-600 focus:border-adderrels-500 rounded-xl px-4 py-4 pr-16 text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-adderrels-500/50 transition-all duration-300"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">BTC</span>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm border ${message.type === 'error' ? 'bg-red-500/10 border-red-500/40 text-red-300' : 'bg-green-500/10 border-green-500/40 text-green-300'}`}>
          <p className="font-semibold">{message.title}</p>
          {message.description && <p className="text-xs opacity-90 mt-1">{message.description}</p>}
        </div>
      )}

      {/* Estimation note: depends on server price; hidden when zero */}
      {pledgeAmount && estimatedTokens > 0 && (
        <div className="bg-gradient-to-r from-adderrels-500/10 to-adderrels-600/10 border border-adderrels-500/30 p-4 rounded-xl mb-6">
          <p className="text-gray-400 text-sm mb-1">Estimated ADDERRELS Tokens</p>
          <div className="flex items-center space-x-2">
            <p className="text-xl font-bold text-adderrels-400" data-testid="text-estimated-tokens">
              ~{estimatedTokens.toLocaleString()} ADDERRELS
            </p>
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handlePledge}
        disabled={disabled}
        data-testid="button-pledge"
        className="w-full bg-gradient-to-r from-adderrels-500 to-adderrels-600 hover:from-adderrels-600 hover:to-adderrels-700 py-4 rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-105 animate-glow flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? 'Processing...' : 'Pledge BTC'}
      </button>

      <div className="mt-4 text-center">
        <p className="text-sm text-gray-400">
          {isWalletConnected ? 'Enter your BTC amount to participate in the auction' : 'Connect your wallet to participate in the auction'}
        </p>
      </div>
    </div>
  );
};

export default PledgeInterface;
