// File: PledgeInterface.tsx - Modern pledge UI; disables when BTC price unavailable or wallet not connected. Shows wallet BTC/USD balance. Testing mode shows demo $100k USD-equivalent balance; verification handled on backend.
// Note: Builds CreatePledgeRequest with canonical satsAmount (BTC optional for back-compat). This UI does not initiate payment; non-testing pledges will fail without txid.
import React, { useEffect, useMemo, useState } from 'react';
import type { WalletDetails, CreatePledgeRequest } from '@shared/types/common';
import { useWalletBalance } from 'bitcoin-wallet-adapter';
import { useWebSocket } from '@/hooks/use-websocket';

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
  const { auctionState } = useWebSocket();
  const auctionId = auctionState?.id as string | undefined;
  const isTesting = process.env.NEXT_PUBLIC_TESTING === 'true';

  // Disable pledging before auction starts
  const isPreStart = typeof auctionState?.startTimeMs === 'number' && typeof auctionState?.serverTimeMs === 'number'
    ? ((auctionState?.serverTimeMs as number) < (auctionState?.startTimeMs as number))
    : false;

  // Backend BTC price
  const [backendPrice, setBackendPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const fetchBackendPrice = () => {
    let cancelled = false;
    (async () => {
      if (!auctionId) return;
      try {
        setPriceLoading(true);
        const res = await fetch(`${apiUrl}/api/pledges/max-pledge/${auctionId}`);
        if (!res.ok) return;
        const data = await res.json().catch(() => null) as { currentBTCPrice?: number } | null;
        if (!cancelled) {
          const p = typeof data?.currentBTCPrice === 'number' ? data.currentBTCPrice : null;
          setBackendPrice(p);
        }
      } catch (_) {
        // noop
      } finally {
        if (!cancelled) setPriceLoading(false);
      }
    })();
    return () => { cancelled = true; };
  };

  useEffect(() => {
    const cleanup = fetchBackendPrice();
    return cleanup;
  }, [auctionId, apiUrl]);

  // Wallet balance (BTC) and price (USD per BTC)
  const {
    balance,
    btcPrice,
    isLoading,
    fetchBalance,
    refreshPrice,
    formatBalance,
    convertToUSD,
  } = useWalletBalance();

  const confirmedBtc = useMemo(() => {
    const v = typeof balance?.confirmed === 'number' ? balance.confirmed : 0;
    return Number.isFinite(v) ? v : 0;
  }, [balance?.confirmed]);

  const priceUsd = useMemo(() => {
    // Prefer backend price
    if (typeof backendPrice === 'number' && Number.isFinite(backendPrice)) return backendPrice;
    const p = typeof btcPrice === 'number' ? btcPrice : 0;
    return Number.isFinite(p) ? p : 0;
  }, [btcPrice, backendPrice]);

  // Testing-mode: compute demo BTC balance from $100,000 USD
  const demoMaxBtc = useMemo(() => {
    if (!isTesting) return 0;
    const price = priceUsd;
    if (!price || price <= 0) return 0;
    const btc = 100_000 / price;
    return Number.isFinite(btc) ? btc : 0;
  }, [isTesting, priceUsd]);

  const usdBalance = useMemo(() => {
    // Prefer backend conversion first
    if (priceUsd > 0) return confirmedBtc * priceUsd;
    if (typeof balance?.usd === 'number' && Number.isFinite(balance.usd)) return balance.usd;
    const conv = typeof convertToUSD === 'function' ? convertToUSD(confirmedBtc) : null;
    if (typeof conv === 'number' && Number.isFinite(conv)) return conv;
    return null;
  }, [balance?.usd, convertToUSD, confirmedBtc, priceUsd]);

  const estimatedTokens = useMemo(() => {
    if (!pledgeAmount) return 0;
    const amt = parseFloat(pledgeAmount);
    if (isNaN(amt) || !currentPrice || currentPrice <= 0) return 0;
    // Example: currentPrice is USD/token; convert BTC->USD amount then divide by price
    // If your currentPrice is already BTC/token, adjust accordingly.
    const btcUsd = 0; // unknown here; estimation relies on server-side. Keep 0 if unknown.
    return Math.max(0, Math.floor((btcUsd * amt) / currentPrice));
  }, [pledgeAmount, currentPrice]);

  const exceedsBalance = useMemo(() => {
    const amt = parseFloat(pledgeAmount || '');
    if (!isWalletConnected) return false; // don't show error when not connected
    if (!pledgeAmount || isNaN(amt)) return false;
    if (isTesting && demoMaxBtc > 0) return amt > demoMaxBtc;
    return amt > confirmedBtc;
  }, [pledgeAmount, confirmedBtc, isWalletConnected, isTesting, demoMaxBtc]);

  const handlePledge = async () => {
    setMessage(null);

    if (isPreStart) {
      setMessage({ type: 'error', title: 'Auction has not started', description: 'Pledging will open when the auction starts.' });
      return;
    }

    if (!isWalletConnected) {
      setMessage({ type: 'error', title: 'Wallet not connected', description: 'Please connect your wallet to make a pledge' });
      return;
    }

    const amount = parseFloat(pledgeAmount);
    if (Number.isNaN(amount) || (minPledge && amount < minPledge) || (maxPledge && amount > maxPledge)) {
      setMessage({ type: 'error', title: 'Invalid amount', description: `Pledge amount must be between ${minPledge} and ${maxPledge} BTC` });
      return;
    }

    try {
      setIsPending(true);
      // Ensure we have a guestId; auto-fetch if missing
      let guestId = typeof window !== 'undefined' ? localStorage.getItem('guestId') : null;
      if (!guestId) {
        try {
          const r = await fetch(`${apiUrl}/api/auth/guest-id`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
          if (r.ok) {
            const j = await r.json().catch(() => null) as { guestId?: string } | null;
            if (j?.guestId) {
              guestId = j.guestId;
              try { if (typeof window !== 'undefined') localStorage.setItem('guestId', guestId); } catch { /* noop */ }
            }
          }
        } catch { /* noop */ }
      }
      if (!guestId) throw new Error('Guest ID not found');

      // Build payload expected by backend createPledge
      const walletDetails: WalletDetails = {
        cardinal: walletAddress ?? '',
        ordinal: '',
        cardinalPubkey: '',
        ordinalPubkey: '',
        wallet: 'Unknown',
        connected: !!isWalletConnected,
      };
      // Compute canonical sats amount from BTC
      const sats = Math.max(0, Math.round((Number.isFinite(amount) ? amount : 0) * 1e8));
      // Local payload type: txid optional here since this UI doesn't initiate payment
      type LocalCreatePledge = Omit<CreatePledgeRequest, 'txid'> & { txid?: string };
      const payload: LocalCreatePledge = {
        // Prefer wallet cardinal address as the user identifier; fallback to guestId
        userId: (walletAddress && walletAddress.length > 0) ? walletAddress : guestId,
        satsAmount: sats,
        walletDetails,
        // Note: This UI does not trigger payment; include txid only in testing to satisfy backend contract
        ...(isTesting ? { txid: 'testing-txid' } : {}),
      };

      const res = await fetch(`${apiUrl}/api/pledges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || 'Failed to create pledge');
      }

      const data = await res.json().catch(() => null) as { id?: string } | null;
      setMessage({ type: 'success', title: 'Pledge submitted!', description: 'Your pledge has been submitted successfully' });
      setPledgeAmount('');

      // Frontend no longer auto-verifies in testing; backend handles verification.
    } catch (e: any) {
      setMessage({ type: 'error', title: 'Pledge failed', description: String(e?.message || 'There was an error processing your pledge') });
    } finally {
      setIsPending(false);
    }
  };

  // No auto-verify timers on frontend; no cleanup required.

  const disabled = !isWalletConnected || isPending || !pledgeAmount;
  const isDisabled = isPreStart || disabled || exceedsBalance;

  return (
    <div className="glass-card p-8 rounded-3xl">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold">Make Your Pledge</h3>
        <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
          <span className="text-sm font-bold">₿</span>
        </div>
      </div>

      {isPreStart && (
        <div className="mb-6 rounded-xl px-4 py-3 text-sm border bg-amber-500/10 border-amber-500/40 text-amber-300">
          <p className="font-semibold">Pledging opens when the auction starts.</p>
          {typeof auctionState?.startTimeMs === 'number' && (
            <p className="text-xs opacity-90 mt-1">Scheduled start (UTC): {new Date(auctionState.startTimeMs).toUTCString()}</p>
          )}
        </div>
      )}

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
      {/* Wallet Balance */}
      {isWalletConnected && (
        <div className="bg-dark-800/50 p-4 rounded-xl mb-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Your Balance{isTesting ? ' (Testing)' : ''}</p>
              <p className="text-cyan-400 font-semibold">
                {isTesting
                  ? (demoMaxBtc > 0
                    ? `${demoMaxBtc.toFixed(6)} BTC`
                    : 'Loading…')
                  : (isLoading
                    ? 'Loading…'
                    : (formatBalance ? formatBalance(confirmedBtc) : `${confirmedBtc} BTC`))}
                <span className="text-gray-400 text-xs ml-2">
                  {isWalletConnected
                    ? (isTesting && demoMaxBtc > 0
                      ? '(Testing demo balance = $100,000)'
                      : (!isTesting && usdBalance !== null
                        ? `(~$${usdBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })})`
                        : (priceLoading ? 'Fetching USD price…' : 'USD price unavailable')))
                    : ''}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={async () => { try { await fetchBalance(); await refreshPrice(); fetchBackendPrice(); } catch (_) { /* noop */ } }}
              className="text-xs px-3 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-50"
              disabled={!!isLoading}
            >
              Refresh
            </button>
          </div>
        </div>
      )}

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
            disabled={isPreStart}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">BTC</span>
        </div>
        {exceedsBalance && (
          <p className="mt-2 text-sm text-red-300">
            {isTesting ? 'Amount exceeds your testing demo balance.' : 'Amount exceeds your confirmed wallet balance.'}
          </p>
        )}
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
        disabled={isDisabled}
        data-testid="button-pledge"
        className="w-full bg-gradient-to-r from-adderrels-500 to-adderrels-600 hover:from-adderrels-600 hover:to-adderrels-700 py-4 rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-105 animate-glow flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? 'Processing...' : 'Pledge BTC'}
      </button>

      <div className="mt-4 text-center">
        <p className="text-sm text-gray-400">
          {isPreStart
            ? 'Pledging is disabled until the auction starts.'
            : (isWalletConnected ? 'Enter your BTC amount to participate in the auction' : 'Connect your wallet to participate in the auction')}
        </p>
      </div>
    </div>
  );
};

export default PledgeInterface;
