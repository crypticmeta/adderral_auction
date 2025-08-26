// YourPledges component lists pledges made by the current user for the active auction
// Component: YourPledges
// Fetches user-scoped pledges and renders status/position with null-safety.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PledgeItem } from '@shared/types/common';
import { useWalletAddress } from 'bitcoin-wallet-adapter';
import { useWebSocket as useWSContext } from '@/contexts/WebSocketContext';

interface YourPledgesProps {
  auctionId: string;
}

const YourPledges: React.FC<YourPledgesProps> = ({ auctionId }) => {
  const [userPledges, setUserPledges] = useState<PledgeItem[]>([]);
  const [error, setError] = useState<string>('');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  const wallet = useWalletAddress();
  const { socket, isAuthenticated } = useWSContext();
  const mountedRef = useRef(true);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const cardinalAddr = useMemo(() => {
    // Prefer adapter wallet address when available
    const w = wallet?.cardinal_address || '';
    if (typeof w === 'string' && w.length > 0) return w;
    // Testing-mode fallback: use localStorage.testWallet.cardinal
    try {
      const isTesting = String(process.env.NEXT_PUBLIC_TESTING).toLowerCase() === 'true';
      if (!isTesting || typeof window === 'undefined') return '';
      const raw = localStorage.getItem('testWallet');
      if (!raw) return '';
      const parsed = JSON.parse(raw);
      const fromTest = parsed?.cardinal || parsed?.cardinal_address || '';
      return typeof fromTest === 'string' && fromTest.length > 0 ? fromTest : '';
    } catch {
      return '';
    }
  }, [wallet?.cardinal_address]);

  const getGuestId = () => {
    try { return (typeof window !== 'undefined') ? (localStorage.getItem('guestId') || '') : ''; } catch { return ''; }
  };

  const fetchByUserId = async (userId: string) => {
    const res = await fetch(`${apiUrl}/api/pledges/user/${encodeURIComponent(userId)}/auction/${encodeURIComponent(auctionId)}`);
    if (!res.ok) throw new Error(`Failed to fetch user pledges (${res.status})`);
    const data = await res.json();
    return Array.isArray(data) ? data as PledgeItem[] : [] as PledgeItem[];
  };

  const fetchByCardinal = async (addr: string) => {
    const res = await fetch(`${apiUrl}/api/pledges/auction/${encodeURIComponent(auctionId)}/cardinal/${encodeURIComponent(addr)}`);
    if (!res.ok) throw new Error(`Failed to fetch pledges for address (${res.status})`);
    const data = await res.json();
    return Array.isArray(data) ? data as PledgeItem[] : [] as PledgeItem[];
  };

  const refresh = async () => {
    try {
      if (!auctionId) return;
      const gid = getGuestId();
      let pledges: PledgeItem[] = [];
      if (cardinalAddr) {
        pledges = await fetchByCardinal(cardinalAddr);
      } else if (gid) {
        pledges = await fetchByUserId(gid);
      } else {
        pledges = [];
      }
      if (mountedRef.current) setUserPledges(pledges);
      if (mountedRef.current) setError('');
    } catch (e: any) {
      if (mountedRef.current) setError(e?.message || 'Failed to fetch your pledges');
    }
  };

  useEffect(() => { refresh(); }, [auctionId, apiUrl, cardinalAddr]);

  // Auto-refresh when pledge-related websocket events arrive
  useEffect(() => {
    if (!socket || !isAuthenticated) return;
    const debounced = (() => {
      let t: any; return () => { if (t) clearTimeout(t); t = setTimeout(() => { refresh(); }, 250); };
    })();
    const isForActiveAuction = (d: any) => !d?.auctionId || d.auctionId === auctionId;
    const onAnyCreate = (d: any) => { if (isForActiveAuction(d)) debounced(); };
    const onProcessed = (d: any) => { if (isForActiveAuction(d)) debounced(); };
    const onQueue = (d: any) => { if (isForActiveAuction(d)) debounced(); };
    socket.on('pledge:created', onAnyCreate);
    socket.on('pledge_created', onAnyCreate); // may not include auctionId
    socket.on('pledge:processed', onProcessed);
    socket.on('pledge_verified', onProcessed); // may not include auctionId
    socket.on('pledge:queue:update', onQueue);
    socket.on('pledge:queue:position', onQueue);
    return () => {
      socket.off('pledge:created', onAnyCreate);
      socket.off('pledge_created', onAnyCreate);
      socket.off('pledge:processed', onProcessed);
      socket.off('pledge_verified', onProcessed);
      socket.off('pledge:queue:update', onQueue);
      socket.off('pledge:queue:position', onQueue);
    };
  }, [socket, isAuthenticated, auctionId, apiUrl, cardinalAddr]);

  return (
    <div className="bg-gradient-to-br from-dark-800/50 to-dark-700/50 backdrop-blur-md border border-primary-500/30 rounded-xl p-6 transition-all hover:border-primary-500/60 hover:shadow-glow-md">
      <h2 className="text-2xl font-semibold mb-2 text-white">Your Pledges</h2>

      {error && (
        <div className="bg-gradient-to-r from-red-600/20 to-red-700/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="mb-6">
        {userPledges.length === 0 ? (
          <div className="text-center py-6 text-gray-400">No pledges yet</div>
        ) : (
          <div className="space-y-2">
            {userPledges.map((pledge) => (
              <div
                key={pledge.id}
                className={`p-3 rounded-lg border ${
                  pledge.needsRefund
                    ? 'bg-red-600/10 border-red-500/30 text-red-400'
                    : pledge.verified
                      ? 'bg-green-600/10 border-green-500/30 text-green-400'
                      : 'bg-blue-600/10 border-blue-500/30 text-blue-400'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-semibold">{(((pledge?.satsAmount ?? 0) / 1e8) || 0).toFixed(8)} BTC</span>
                    <div className="text-xs mt-1">
                      {pledge?.needsRefund ? (
                        <span className="flex items-center">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.721-1.36 3.486 0l6.347 11.3c.75 1.333-.213 2.997-1.743 2.997H3.653c-1.53 0-2.493-1.664-1.743-2.997l6.347-11.3zM11 13a1 1 0 10-2 0 1 1 0 002 0zm-1-8a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          Refund Pending
                        </span>
                      ) : pledge?.verified ? (
                        <span className="flex items-center">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Confirmed
                        </span>
                      ) : (
                        <span className="flex items-center">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                          </svg>
                          In Queue
                        </span>
                      )}
                    </div>
                  </div>
                  {!pledge?.verified && (
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Position</div>
                      <div className="font-bold">{typeof pledge?.queuePosition === 'number' ? pledge.queuePosition : '—'}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default YourPledges;
