// PledgeForm
// Purpose: Allow users to submit BTC pledges and verify them with a real on-chain txid. No mock/demo code.
// Behavior: Pay-first pledge creation. Fetches a single deposit address, triggers wallet payment, then creates pledge with txid. Verification handled by scheduler.
// Styling: TailwindCSS using project theme. Buttons and alerts follow gradient styles.
// Null-safety: Guards around tokens, auction state, socket events, and optional fields.
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useWalletAddress, usePayBTC } from 'bitcoin-wallet-adapter';
import type { WalletInfo, MaxPledgeInfo, DepositAddressResponse, PledgeItem } from '../types';

interface PledgeFormProps {
  isWalletConnected: boolean;
}

const PledgeForm: React.FC<PledgeFormProps> = ({ isWalletConnected }) => {
  const [btcAmount, setBtcAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [pledgeData, setPledgeData] = useState<Partial<PledgeItem> | null>(null);
  const [maxPledgeInfo, setMaxPledgeInfo] = useState<MaxPledgeInfo | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);

  const { auctionState, isAuthenticated, socket } = useWebSocket();
  const isTesting = process.env.NEXT_PUBLIC_TESTING === 'true';
  const walletAddr = useWalletAddress?.() as any;
  const { payBTC } = usePayBTC?.() as any;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  // Warn once if falling back to localhost
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_API_URL) {
      // eslint-disable-next-line no-console
      console.warn('NEXT_PUBLIC_API_URL not set. Using default http://localhost:5000');
    }
  }, []);

  // Mounted ref to avoid state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // Fetch max pledge info (active auction) and refetch on real-time events
  useEffect(() => {
    const auctionId = auctionState?.id;
    if (!auctionId) return;
    if (auctionState?.ceilingReached) return; // avoid fetching when ceiling reached

    const fetchMaxPledgeInfo = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/pledges/max-pledge/${auctionId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch max pledge info');
        }
        const data = await response.json();
        if (mountedRef.current) setMaxPledgeInfo(data);
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
      const onQueuePos = (payload: any) => {
        const pos = payload?.position ?? payload?.queuePosition ?? payload?.pos ?? null;
        if (pos !== null && pos !== undefined && mountedRef.current) setQueuePosition(Number(pos));
      };
      socket.on('pledge:queue:position', onQueuePos);
    }

    return () => {
      if (socket) {
        socket.off('pledge:queue:update');
        socket.off('pledge:created');
        socket.off('pledge:processed');
        socket.off('pledge:queue:position');
      }
    };
  }, [apiUrl, socket, auctionState?.id]);

  // Compute testing-mode demo balance in BTC based on current price
  const demoMaxBtc = useMemo(() => {
    const price = maxPledgeInfo?.currentBTCPrice ?? auctionState?.currentPrice ?? 0;
    if (!isTesting || !price || price <= 0) return 0;
    const btc = 100_000 / price; // $100,000 USD in BTC
    return Number.isFinite(btc) ? btc : 0;
  }, [isTesting, maxPledgeInfo?.currentBTCPrice, auctionState?.currentPrice]);

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

  const handlePledge = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLoading) return; // prevent double submits

    if (!isWalletConnected) {
      setError('Please connect your wallet first');
      return;
    }

    if (!isAuthenticated) {
      setError('WebSocket authentication required');
      return;
    }

    if (auctionState?.ceilingReached) {
      setError('Ceiling reached. Pledging is disabled.');
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

    // Testing-mode: enforce demo balance cap ($10k USD)
    if (isTesting && demoMaxBtc > 0 && amount > demoMaxBtc) {
      const maxStr = demoMaxBtc.toFixed(6);
      setError(`Testing mode: exceeds demo balance. Max allowed ≈ ${maxStr} BTC (=$100,000).`);
      return;
    }

    setIsLoading(true);
    setError('');
    setPledgeData(null);

    try {
      // Gather identifiers and wallet metadata
      const guestId = typeof window !== 'undefined' ? localStorage.getItem('guestId') : null;
      const userId = guestId || undefined;

      // Build wallet info based on mode
      let walletInfo: WalletInfo | null = null;

      if (isTesting) {
        const testWalletRaw = typeof window !== 'undefined' ? localStorage.getItem('testWallet') : null;
        const testWallet = (() => {
          try { return testWalletRaw ? JSON.parse(testWalletRaw) : null; } catch { return null; }
        })();
        walletInfo = testWallet ? {
          address: testWallet.cardinal || testWallet.cardinal_address || null,
          ordinalAddress: testWallet.ordinal || testWallet.ordinal_address || null,
          publicKey: testWallet.cardinalPubkey || testWallet.cardinal_pubkey || null,
          ordinalPubKey: testWallet.ordinalPubkey || testWallet.ordinal_pubkey || null,
          wallet: testWallet.wallet || 'TestWallet',
          network: 'mainnet',
        } : null;
        // No signature in testing mode
      } else {
        // Use real wallet details from bitcoin-wallet-adapter
        const address = walletAddr?.cardinal ?? walletAddr?.address ?? null;
        const ordinalAddress = walletAddr?.ordinal ?? walletAddr?.taproot ?? null;
        const publicKey = walletAddr?.cardinalPubkey ?? walletAddr?.publicKey ?? null;
        const ordinalPubKey = walletAddr?.ordinalPubkey ?? walletAddr?.taprootPubkey ?? null;
        const wallet = walletAddr?.wallet ?? null;
        const network = walletAddr?.network ?? 'mainnet';

        walletInfo = {
          address: address ?? null,
          ordinalAddress: ordinalAddress ?? null,
          publicKey: publicKey ?? null,
          ordinalPubKey: ordinalPubKey ?? null,
          wallet: wallet ?? null,
          network,
        };

        // No pre-pledge signature; payment itself serves as proof of control.
      }

      if (!userId) {
        throw new Error('Missing user identity. Please refresh the page to initialize connection.');
      }
      if (!walletInfo || !walletInfo.address) {
        throw new Error('Missing wallet info. Please connect your wallet first.');
      }
      // New flow: get deposit address (with retry), pay, obtain txid, then create pledge with txid
      const addrData: DepositAddressResponse = await fetchDepositAddressWithRetry(1, 500);
      const depositAddress: string | null = addrData?.depositAddress ?? null;
      const network: string = walletInfo?.network || walletAddr?.network || addrData?.network || 'mainnet';
      const sats = Math.round(amount * 1e8);
      if (!depositAddress || !Number.isFinite(sats) || sats <= 0) {
        throw new Error('Missing or invalid deposit details.');
      }

      if (typeof payBTC !== 'function') {
        throw new Error('Wallet payment function unavailable.');
      }
      let txFromPay: string | undefined;
      try {
        const payRes = await payBTC({ address: depositAddress, amount: sats, network });
        txFromPay = payRes?.txid || payRes?.txId || payRes?.transactionId;
      } catch (payErr: any) {
        const msg = payErr?.message || payErr?.error || 'Payment failed or was rejected.';
        throw new Error(msg);
      }
      if (!txFromPay) {
        throw new Error('Payment sent but wallet did not return a txid. Cannot create pledge.');
      }

      // Optional: re-check ceiling; proceed regardless to allow refund tracking
      const payload: any = { userId, btcAmount: amount, walletInfo, txid: txFromPay, depositAddress };

      const response = await fetch(`${apiUrl}/api/pledges/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let message = 'Failed to create pledge';
        try { const errorData = await response.json(); message = errorData?.error || errorData?.message || message; } catch { }
        throw new Error(message);
      }

      const data = await response.json();
      if (mountedRef.current) {
        setPledgeData(data);
        setBtcAmount('');
      }

      if (data.queuePosition) {
        if (mountedRef.current) setQueuePosition(data.queuePosition);
      }
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  // No auto-verify timers or manual verify UI; verification handled by scheduler.

  const isAuctionActive = auctionState?.isActive ?? false;
  const ceilingReached = !!auctionState?.ceilingReached;
  const belowMinCapacity = !!maxPledgeInfo && maxPledgeInfo.maxPledge < maxPledgeInfo.minPledge;
  const zeroCapacity = !!maxPledgeInfo && maxPledgeInfo.maxPledge <= 0;

  return (
    <div className="bg-gradient-to-br from-dark-800/50 to-dark-700/50 backdrop-blur-md border border-primary-500/30 rounded-xl p-6 transition-all hover:border-primary-500/60 hover:shadow-glow-md">
      <h2 className="text-2xl font-semibold mb-2 text-white">Make a Pledge</h2>
      <p className="text-gray-300 mb-6">
        Pledge BTC to secure your ADDERRELS token allocation. First come, first served until ceiling is reached.
      </p>

      {isTesting && (
        <div className="bg-blue-600/20 border border-blue-500/30 text-blue-300 px-4 py-3 rounded-lg mb-4 text-sm" role="status" aria-live="polite">
          Testing mode is enabled. Payments may be simulated and amounts are not sent on-chain.
        </div>
      )}

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
          <h3 className="font-semibold">Payment Recorded</h3>
          <p className="text-sm">Your payment txid was recorded. Confirmation will be processed automatically.</p>
          {queuePosition !== null && (
            <div className="mt-2 p-2 bg-blue-500/20 border border-blue-400/30 rounded-lg">
              <p className="text-blue-400 text-sm">
                <span className="font-semibold">Queue Position:</span> {queuePosition}
              </p>
            </div>
          )}
        </div>
      )}

      {pledgeData && pledgeData.verified && (
        <div className="bg-gradient-to-r from-green-600/20 to-green-700/20 border border-green-500/30 text-green-400 px-4 py-3 rounded-lg mb-4">
          <h3 className="font-semibold mb-2">Pledge Verified!</h3>
          <p className="text-sm">Your pledge of {pledgeData.btcAmount} BTC is confirmed.</p>
          {(pledgeData.refundedAmount ?? 0) > 0 && (
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
              onChange={(e) => {
                const v = e.target.value;
                // clamp to 8 decimal places
                const parts = v.split('.');
                if (parts.length === 2 && parts[1].length > 8) {
                  parts[1] = parts[1].slice(0, 8);
                }
                setBtcAmount(parts.join('.'));
              }}
              step="0.00000001"
              min={maxPledgeInfo ? String(maxPledgeInfo.minPledge) : undefined}
              max={maxPledgeInfo ? String(maxPledgeInfo.maxPledge) : undefined}
              className="w-full px-3 py-2 bg-dark-900/50 border border-primary-500/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 pr-12 text-gray-200 placeholder-gray-500"
              placeholder="0.01"
              required
              disabled={!isWalletConnected || !isAuctionActive || ceilingReached || isLoading || (pledgeData && !pledgeData.verified) || belowMinCapacity || zeroCapacity}
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
          {isTesting && demoMaxBtc > 0 && (
            <p className="text-xs text-amber-400 mt-1.5">
              Testing mode: Demo balance ≈ {demoMaxBtc.toFixed(6)} BTC (=$100,000)
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={!isWalletConnected || !isAuctionActive || ceilingReached || isLoading || !!pledgeData || belowMinCapacity || zeroCapacity}
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
