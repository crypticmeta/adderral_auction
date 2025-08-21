// File: PledgeInterface.tsx - Modern pledge UI; disables when BTC price unavailable or wallet not connected. Shows wallet BTC/USD balance. Testing mode shows demo $100k USD-equivalent balance; verification handled on backend.
// Update: Added pledge amount slider with 25/50/75/100% checkpoints (100% leaves 10,000 sats for fees). Syncs with input.
// Update: Displays USD equivalent of entered BTC pledge using live BTC price (with null checks).
// Update: Adopted pay-first flow: fetch deposit address, perform wallet payment to get txid, then create pledge with txid.
// Testing mode: simulates payment by delaying randomly (0.3s–2s) and generating a fake txid for load testing.
import React, { useEffect, useMemo, useState } from 'react';
import type { WalletDetails, CreatePledgeRequest } from '@shared/types/common';
import { useWalletBalance, usePayBTC } from 'bitcoin-wallet-adapter';
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
  const [sliderPercent, setSliderPercent] = useState<number>(0); // 0..100

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

  // Fetch deposit address with simple retry for transient errors
  const fetchDepositAddressWithRetry = async (
    retries = 1,
    delayMs = 500
  ): Promise<{ depositAddress: string | null; network?: string | null; }> => {
    try {
      const res = await fetch(`${apiUrl}/api/pledges/deposit-address`);
      if (!res.ok) {
        throw new Error(`Status ${res.status}`);
      }
      const data = await res.json();
      return { depositAddress: data?.depositAddress ?? null, network: data?.network ?? null };
    } catch (e) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, delayMs));
        return fetchDepositAddressWithRetry(retries - 1, delayMs * 2);
      }
      throw e;
    }
  };

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

  // Wallet pay function (real mode)
  const { payBTC } = (usePayBTC?.() as any) || {};

  // Safe random hex generator for testing-mode txid
  const genRandHex = (bytes = 8) => {
    try {
      const g = (globalThis as any)?.crypto || (typeof window !== 'undefined' ? (window as any).crypto : undefined);
      if (g && typeof g.getRandomValues === 'function') {
        const arr = new Uint8Array(bytes);
        g.getRandomValues(arr);
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch { /* noop */ }
    // Fallback
    let out = '';
    for (let i = 0; i < bytes; i++) out += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    return out;
  };

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

  // Effective spendable balance in BTC (testing uses demo balance when available)
  const effectiveBalanceBtc = useMemo(() => {
    if (isTesting && demoMaxBtc > 0) return demoMaxBtc;
    return confirmedBtc;
  }, [isTesting, demoMaxBtc, confirmedBtc]);

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
    const amtBtc = parseFloat(pledgeAmount);
    if (!Number.isFinite(amtBtc) || amtBtc <= 0) return 0;
    // Convert pledge BTC -> USD using priceUsd, then divide by currentPrice (USD/token)
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return 0;
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return 0;
    const pledgeUsd = amtBtc * (priceUsd as number);
    const tokens = pledgeUsd / (currentPrice as number);
    return tokens > 0 ? Math.floor(tokens) : 0;
  }, [pledgeAmount, priceUsd, currentPrice]);

  // USD equivalent for the entered BTC amount (null when price or amount unavailable)
  const pledgeUsd = useMemo(() => {
    const amtBtc = parseFloat(pledgeAmount || '');
    if (!Number.isFinite(amtBtc) || amtBtc <= 0) return null;
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
    return amtBtc * (priceUsd as number);
  }, [pledgeAmount, priceUsd]);

  const exceedsBalance = useMemo(() => {
    const amt = parseFloat(pledgeAmount || '');
    if (!isWalletConnected) return false; // don't show error when not connected
    if (!pledgeAmount || isNaN(amt)) return false;
    if (isTesting && demoMaxBtc > 0) return amt > demoMaxBtc;
    return amt > confirmedBtc;
  }, [pledgeAmount, confirmedBtc, isWalletConnected, isTesting, demoMaxBtc]);

  // Reserve used when user selects 100%
  const reserveSatsBtc = 0.0001; // 10,000 sats

  // Compute dynamic slider bounds in percent based on limits and balance
  const { minPercent, maxPercent } = useMemo(() => {
    const base = effectiveBalanceBtc;
    if (!Number.isFinite(base) || base <= 0) return { minPercent: 0, maxPercent: 0 };
    const minPct = Number.isFinite(minPledge) && (minPledge as number) > 0 ? Math.min(100, Math.max(0, ((minPledge as number) / base) * 100)) : 0;
    // Spendable cap respects maxPledge and balance; when mapping to 100% preset, we leave reserve, but general max is bounded by maxPledge and base
    const spendCap = Number.isFinite(maxPledge) && (maxPledge as number) > 0 ? Math.min(base, maxPledge as number) : base;
    const maxPct = Math.min(100, Math.max(0, (spendCap / base) * 100));
    return { minPercent: minPct, maxPercent: maxPct };
  }, [effectiveBalanceBtc, minPledge, maxPledge]);

  // Derive slider percent from input edits
  useEffect(() => {
    const amt = parseFloat(pledgeAmount || '');
    const base = effectiveBalanceBtc;
    if (!Number.isFinite(amt) || !Number.isFinite(base) || base <= 0) {
      setSliderPercent(0);
      return;
    }
    // When user enters approx (balance - 10k sats), treat as 100%
    const maxSpendPreset = Math.max(0, base - reserveSatsBtc);
    let percent = amt >= maxSpendPreset ? 100 : Math.min(100, Math.max(0, (amt / base) * 100));
    // Clamp to dynamic bounds
    percent = Math.min(maxPercent, Math.max(minPercent, percent));
    setSliderPercent(percent);
  }, [pledgeAmount, effectiveBalanceBtc, minPercent, maxPercent]);

  // Helper to format BTC amount to up to 8 decimals without trailing zeros
  const formatBtc = (n: number) => {
    if (!Number.isFinite(n)) return '';
    const fixed = n.toFixed(8);
    return fixed.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1');
  };

  // Compute amount from percent, respecting min/max and 10k sats reserve at 100%
  const computeAmountFromPercent = (p: number) => {
    const base = effectiveBalanceBtc;
    if (!Number.isFinite(base) || base <= 0) return '';
    // Clamp to dynamic bounds
    const clampedP = Math.min(maxPercent, Math.max(minPercent, p));
    const percentBase = clampedP >= 100 ? Math.max(0, base - reserveSatsBtc) : base;
    let amt = (percentBase * clampedP) / 100;
    // Enforce bounds when non-zero
    if (amt > 0) {
      if (Number.isFinite(maxPledge) && maxPledge > 0) amt = Math.min(amt, maxPledge);
      if (Number.isFinite(minPledge) && minPledge > 0) amt = Math.max(amt, minPledge);
    }
    // Ensure we never exceed spendable in any case
    const spendCap = clampedP >= 100 ? Math.max(0, base - reserveSatsBtc) : base;
    amt = Math.min(amt, spendCap);
    // Snap to exact max when within epsilon to avoid floating drift
    if (Number.isFinite(maxPledge) && maxPledge > 0) {
      const eps = 1e-8;
      if (Math.abs(amt - (maxPledge as number)) <= eps || amt > (maxPledge as number) - eps) {
        amt = Math.min(spendCap, maxPledge as number);
      }
    }
    return amt <= 0 ? '' : formatBtc(amt);
  };

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
      // Pay-first flow: fetch deposit address, perform payment (or simulate), then create pledge with txid
      const addrData = await fetchDepositAddressWithRetry(1, 500);
      const depositAddress: string | null = addrData?.depositAddress ?? null;
      const network: string = (addrData?.network as string) || 'mainnet';
      if (!depositAddress) {
        throw new Error('Failed to obtain deposit address');
      }

      // Obtain txid: real wallet in prod, simulated in testing
      let txFromPay: string | undefined;
      if (isTesting) {
        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
        const jitterMs = Math.floor(300 + Math.random() * 1700); // 0.3s - 2.0s
        await sleep(jitterMs);
        const randHex = genRandHex(8);
        txFromPay = `test-${Date.now().toString(16)}-${randHex}`;
      } else {
        if (typeof payBTC !== 'function') {
          throw new Error('Wallet payment function unavailable.');
        }
        try {
          const payRes = await payBTC({ address: depositAddress, amount: sats, network });
          txFromPay = payRes?.txid || payRes?.txId || payRes?.transactionId;
        } catch (payErr: any) {
          const msg = payErr?.message || payErr?.error || 'Payment failed or was rejected.';
          throw new Error(msg);
        }
      }

      if (!txFromPay) {
        throw new Error('Payment sent but no txid was returned.');
      }

      const payload: CreatePledgeRequest = {
        userId: (walletAddress && walletAddress.length > 0) ? walletAddress : guestId,
        satsAmount: sats,
        walletDetails,
        txid: txFromPay,
        depositAddress,
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

      {/* Percentage Slider (25/50/75/100 with 10,000 sats reserve at 100%) */}
      {isWalletConnected && effectiveBalanceBtc > (Number.isFinite(minPledge) ? (minPledge as number) : 0) && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-gray-400 text-sm">Use balance</label>
            <span className="text-xs text-gray-500">{sliderPercent.toFixed(1)}%</span>
          </div>
          <input
            type="range"
            min={minPercent}
            max={maxPercent}
            step={0.1}
            value={sliderPercent}
            onChange={(e) => {
              const raw = Number(e.target.value);
              const p = Math.min(maxPercent, Math.max(minPercent, raw));
              setSliderPercent(p);
              const computed = computeAmountFromPercent(p);
              setPledgeAmount(computed);
            }}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-adderrels-500"
          />
          <div className="flex items-center justify-between text-xs text-gray-400 mt-2">
            {([0, 25, 50, 75, 100] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  const target = Math.min(maxPercent, Math.max(minPercent, p));
                  setSliderPercent(target);
                  const computed = computeAmountFromPercent(target);
                  setPledgeAmount(computed);
                }}
                disabled={p < Math.ceil(minPercent) || p > Math.floor(maxPercent)}
                className={`px-2 py-1 rounded-md border ${Math.round(sliderPercent) === p ? 'border-adderrels-500 text-adderrels-400' : 'border-gray-700 hover:border-gray-600'} ${p < Math.ceil(minPercent) || p > Math.floor(maxPercent) ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {p === 100 ? '100% (-10k sats)' : `${p}%`}
              </button>
            ))}
            <div className="ml-2">
              {(Number.isFinite(maxPercent) && maxPercent > 0 && maxPercent < 100) && (
                <button
                  type="button"
                  onClick={() => {
                    const mp = Math.min(100, Math.max(0, maxPercent));
                    setSliderPercent(mp);
                    const amt = Number.isFinite(maxPledge) && (maxPledge as number) > 0 ? (maxPledge as number) : computeAmountFromPercent(mp) as unknown as number;
                    setPledgeAmount(formatBtc(typeof amt === 'number' ? amt : parseFloat(computeAmountFromPercent(mp))));
                  }}
                  className="px-2 py-1 rounded-md border border-adderrels-500 text-adderrels-400 hover:bg-adderrels-500/10"
                  title="Set to maximum allowed"
                >
                  Max
                </button>
              )}
            </div>
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
        {pledgeUsd !== null && (
          <p className="mt-2 text-sm text-gray-400">≈ ${typeof pledgeUsd === 'number' ? pledgeUsd.toLocaleString(undefined, { maximumFractionDigits: 2 }) : ''} USD</p>
        )}
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm border ${message.type === 'error' ? 'bg-red-500/10 border-red-500/40 text-red-300' : 'bg-green-500/10 border-green-500/40 text-green-300'}`}>
          <p className="font-semibold">{message.title}</p>
          {message.description && <p className="text-xs opacity-90 mt-1">{message.description}</p>}
        </div>
      )}

      {/* Estimation note: based on current DB pledges (verified + unverified); subject to change. Hidden when zero */}
      {pledgeAmount && estimatedTokens > 0 && (
        <div className="bg-gradient-to-r from-adderrels-500/10 to-adderrels-600/10 border border-adderrels-500/30 p-4 rounded-xl mb-6">
          <p className="text-gray-400 text-sm mb-1">Estimated ADDERRELS Tokens</p>
          <div className="flex items-center space-x-2">
            <p className="text-xl font-bold text-adderrels-400" data-testid="text-estimated-tokens">
              ~{estimatedTokens.toLocaleString()} ADDERRELS
            </p>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Estimate based on current pledges and live BTC price; subject to change as new pledges arrive.
          </p>
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
