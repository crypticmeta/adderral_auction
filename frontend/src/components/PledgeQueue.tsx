// PledgeQueue component for displaying pledge queue status
// Component: PledgeQueue
// Shows the live queue table for the active auction.
// Includes avatars (DiceBear), truncated usernames, live updates, and allocation estimates.
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useWalletAddress } from 'bitcoin-wallet-adapter';
import { useWebSocket } from '../contexts/WebSocketContext';
import type { PledgeItem, QueuePositionEvent } from '@shared/types/common';

interface PledgeQueueProps {
  auctionId: string;
}

const PledgeQueue: React.FC<PledgeQueueProps> = ({ auctionId }) => {
  const [queuedPledges, setQueuedPledges] = useState<PledgeItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  // Removed local min/max limits display from queue to keep UI focused

  const { socket, isAuthenticated, auctionState } = useWebSocket();
  const wallet = useWalletAddress();
  const mountedRef = useRef(true);
  const hasLoadedRef = useRef(false);
  const inFlightRef = useRef(false);
  useEffect(() => {
    // Ensure mounted flag is accurate across dev strict-mode remounts and HMR
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const getUsername = (p: PledgeItem): string => {
    const addr = p?.user?.cardinal_address || p?.user?.ordinal_address || p?.userId || '';
    if (!addr) return 'guest';
    const s = String(addr);
    if (s.length <= 10) return s;
    return `${s.slice(0, 6)}...${s.slice(-4)}`;
  };

  const toLower = (val?: string | null): string => (typeof val === 'string' ? val.toLowerCase() : '');
  const isConnectedUsersPledge = (p: PledgeItem): boolean => {
    const userCard = toLower(p?.user?.cardinal_address);
    const userOrd = toLower(p?.user?.ordinal_address);
    const wCard = toLower(wallet?.cardinal_address as string | undefined);
    const wOrd = toLower(wallet?.ordinal_address as string | undefined);
    if (!wCard && !wOrd) return false;
    return ((!!userCard && !!wCard && userCard === wCard) || (!!userOrd && !!wOrd && userOrd === wOrd));
  };

  const getAvatar = (p: PledgeItem): string => {
    const seed = p?.user?.ordinal_address || p?.user?.cardinal_address || p?.userId || p.id;
    return `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(String(seed))}`;
  };

  const formatNumber = (n: number | null | undefined, maxFrac = 6): string => {
    if (n == null || Number.isNaN(n)) return '—';
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: maxFrac });
  };

  // Approximation base: include all pledged (confirmed + pending)
  const totalRaisedApproxBTC = useMemo(() => {
    const confirmedRaised = typeof auctionState?.totalRaised === 'number' ? auctionState.totalRaised : 0;
    const pendingRaised = queuedPledges
      .filter(p => !p.verified)
      .reduce((acc, p) => acc + (p.satsAmount / 1e8), 0);
    return confirmedRaised + pendingRaised;
  }, [auctionState?.totalRaised, queuedPledges]);

  const estimateAllocation = (btcAmount: number): number | null => {
    const cfg = auctionState?.config;
    const tokensOnSaleStr = (cfg as any)?.tokensOnSale ?? (cfg as any)?.totalTokens;
    const totalRaisedBTC = totalRaisedApproxBTC;
    if (!tokensOnSaleStr || !(totalRaisedBTC > 0)) return null;
    const tokensOnSale = Number(tokensOnSaleStr);
    if (!(tokensOnSale > 0)) return null;
    // tokens = (tokensOnSale / totalRaisedBTC) * pledgeBTC
    return (tokensOnSale / totalRaisedBTC) * btcAmount;
  };
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_API_URL) {
      // eslint-disable-next-line no-console
      console.warn('NEXT_PUBLIC_API_URL not set. Using default http://localhost:5000');
    }
  }, []);

  // Removed fetching of max pledge info here (handled by pledge form)

  // Fetch pledges in queue
  useEffect(() => {
    if (!auctionId) {
      // No auction to fetch for; ensure we are not stuck in loading state
      setIsLoading(false);
      return;
    }
    // Debounce helper via ref timer
    const timerRef = { id: 0 as any };
    const fetchPledges = async () => {
      try {
        if (inFlightRef.current) return; // prevent overlapping fetches
        inFlightRef.current = true;
        // Only show spinner before the first load completes
        if (mountedRef.current && !hasLoadedRef.current && queuedPledges.length === 0) {
          setIsLoading(true);
        }
        const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
        const response = await fetch(`${apiUrl}/api/auction/${auctionId}/pledges?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
        clearTimeout(timeoutId);
        const end = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        if (!response.ok) {
          // Handle 304 gracefully: keep existing data, stop loading
          if (response.status === 304) {
            if (mountedRef.current) {
              setIsLoading(false);
              hasLoadedRef.current = true;
            }
            return;
          }
          throw new Error(`Failed to fetch pledges (${response.status})`);
        }
        const data = await response.json();
        // Map backend fields to canonical UI shape with satsAmount
        const mapped = Array.isArray(data) ? data.map((p: any) => {
          const sats: number = p?.satsAmount != null
            ? Number(p.satsAmount)
            : (p?.satAmount != null ? Number(p.satAmount) : 0);
          return {
            id: p?.id,
            userId: p?.userId ?? '',
            satsAmount: Number.isFinite(sats) ? sats : 0,
            timestamp: p?.timestamp ?? '',
            queuePosition: p?.queuePosition ?? null,
            // prefer verified state for UI
            verified: Boolean(p?.verified === true || (p?.confirmations ?? 0) >= 1),
            // keep processed only to satisfy shared type; UI does not rely on it
            processed: Boolean(p?.processed === true),
            needsRefund: Boolean(p?.status === 'refunded' || p?.status === 'pending_refund'),
            user: p?.user ? {
              cardinal_address: p.user.cardinal_address ?? null,
              ordinal_address: p.user.ordinal_address ?? null,
            } : undefined,
          } as PledgeItem;
        }) : [];
        if (mountedRef.current) {
          // Preserve any known queuePosition if the refetch returns null (avoid race with socket updates)
          setQueuedPledges(prev => mapped.map(m => {
            const prevItem = prev.find(x => x.id === m.id);
            const queuePosition = (m.queuePosition != null ? m.queuePosition : (prevItem?.queuePosition ?? null));
            return { ...m, queuePosition };
          }));
        }
      } catch (err) {
        if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to fetch pledges');
      } finally {
        inFlightRef.current = false;
        // Always mark loaded once a cycle completes, even if unmounted (helps dev fast-refresh)
        hasLoadedRef.current = true;
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    const debounceFetch = () => {
      if (timerRef.id) clearTimeout(timerRef.id);
      timerRef.id = setTimeout(() => { fetchPledges(); }, 300) as any;
    };

    if (!auctionState?.ceilingReached) {
      fetchPledges();
    } else {
      // Ceiling reached: we don't fetch pending queue; show empty state without spinner
      setIsLoading(false);
      hasLoadedRef.current = true;
    }

    // Set up WebSocket listeners for real-time queue updates
    if (socket && isAuthenticated) {
      // Created events (support both naming styles)
      const onCreated = (data: any) => { if (!data || data?.auctionId === auctionId) debounceFetch(); };
      socket.on('pledge:created', onCreated);
      socket.on('pledge_created', onCreated);

      // Processed/verified events
      const onProcessed = (data: any) => { if (!data || data?.auctionId === auctionId) debounceFetch(); };
      socket.on('pledge:processed', onProcessed);
      socket.on('pledge_verified', onProcessed);

      // Queue updates and position events
      const onQueueUpdate = (d: any) => { if (!d || d?.auctionId === auctionId) debounceFetch(); };
      socket.on('pledge:queue:update', onQueueUpdate);

      // Optional: update live queue position for a pledge (scoped by auction)
      socket.on('pledge:queue:position', (payload: QueuePositionEvent & { auctionId?: string }) => {
        if (payload?.auctionId && payload.auctionId !== auctionId) return;
        const pledgeId = payload?.pledgeId || (payload as any)?.id;
        const posRaw = (payload as any)?.position ?? (payload as any)?.queuePosition;
        if (!pledgeId || posRaw == null) return;
        if (!mountedRef.current) return;
        const posNum = Number(posRaw);
        setQueuedPledges(prev => prev.map(p => p.id === pledgeId ? { ...p, queuePosition: (Number.isFinite(posNum) && posNum >= 1) ? posNum : null } : p));
      });
    }

    return () => {
      if (timerRef.id) clearTimeout(timerRef.id);
      if (socket) {
        socket.off('pledge:created');
        socket.off('pledge_created');
        socket.off('pledge:processed');
        socket.off('pledge_verified');
        socket.off('pledge:queue:update');
        socket.off('pledge:queue:position');
      }
    };
  }, [auctionId, apiUrl, socket, isAuthenticated, auctionState?.ceilingReached, queuedPledges.length]);

  // Safety: if data arrives or we have definitively computed (even empty), stop spinner
  useEffect(() => {
    if (!hasLoadedRef.current && (queuedPledges.length >= 0)) {
      hasLoadedRef.current = true;
    }
    if (isLoading && hasLoadedRef.current) {
      setIsLoading(false);
    }
  }, [queuedPledges.length, isLoading]);
  if (isLoading && !hasLoadedRef.current) {
    return (
      <div className="bg-gradient-to-br from-dark-800/50 to-dark-700/50 backdrop-blur-md border border-primary-500/30 rounded-xl p-6 transition-all hover:border-primary-500/60 hover:shadow-glow-md">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
          <span className="ml-3 text-gray-300">Loading pledge queue...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-dark-800/50 to-dark-700/50 backdrop-blur-md border border-primary-500/30 rounded-xl p-6 transition-all hover:border-primary-500/60 hover:shadow-glow-md">
      <h2 className="text-2xl font-semibold mb-2 text-white">Pledge Queue</h2>

      {error && (
        <div className="bg-gradient-to-r from-red-600/20 to-red-700/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Queue panel */}
      <div>
        {queuedPledges.filter(p => !p.verified).length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            No pledges in the queue yet
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-700 scrollbar-thin scrollbar-thumb-gray-700/70 scrollbar-track-transparent">
            <table className="min-w-[720px] w-full divide-y divide-gray-700">
              <thead className="bg-dark-900/50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">User</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Position</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Amount
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    <div className="flex items-center gap-2">
                      <span>Allocation</span>
                      <button
                        type="button"
                        onClick={() => setShowInfo(v => !v)}
                        className="text-gray-400 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500/50 rounded"
                        aria-label="Show allocation formula info"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M18 10A8 8 0 11.001 9.999 8 8 0 0118 10zM9 7a1 1 0 102 0 1 1 0 00-2 0zm2 2a1 1 0 10-2 0v4a1 1 0 102 0V9z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-dark-800/30 divide-y divide-gray-700">
                {queuedPledges.filter(p => !p.verified).slice(0, 10).map((pledge) => (
                  <tr key={pledge.id} className={`${isConnectedUsersPledge(pledge) ? 'bg-primary-500/10' : ''}`}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-3">
                        <img src={getAvatar(pledge)} alt="avatar" className="w-7 h-7 rounded-full bg-dark-900/50 border border-white/10" />
                        <span className="text-gray-200">{getUsername(pledge)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">{pledge.verified ? '—' : (pledge.queuePosition ?? '—')}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className="font-medium text-gray-200">{formatNumber(pledge.satsAmount / 1e8)} BTC</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {(() => {
                        const est = estimateAllocation(pledge.satsAmount / 1e8);
                        return est == null ? '—' : formatNumber(est, 2);
                      })()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {pledge.verified ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Confirmed
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          In Queue
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-700 bg-dark-900/40 space-y-1">
              <div>
                Note: Expected allocation is an approximation based on total tokens and total pledged (confirmed + pending) and may change as pledges are confirmed.
              </div>
              <div>
                Position shows a pledge's place in the queue (1 = next). It updates live as the queue changes.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PledgeQueue;
