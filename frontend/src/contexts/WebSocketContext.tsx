// File: WebSocketContext.tsx - Provides Socket.IO connection and unified AuctionState to the app
"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import io, { Socket } from 'socket.io-client';
import type { AuctionActivity, AuctionState } from '@shared/types/auction';
import { useDebugLog } from '@/contexts/DebugLogContext';

interface WebSocketContextType {
  isConnected: boolean;
  isAuthenticated: boolean;
  sendMessage: (type: string, data: any) => void;
  auctionState: AuctionState | null;
  connect: () => void;
  disconnect: () => void;
  error: string | null;
  socket: Socket | null;
}

interface WebSocketProviderProps {
  children: ReactNode;
}

// Note: we receive a raw server payload and map it into AuctionState

export const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [auctionState, setAuctionState] = useState<AuctionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debug = (() => {
    try {
      return useDebugLog();
    } catch {
      return null;
    }
  })();

  // Build-time envs (baked during Next.js build)
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || '').trim() || 'http://localhost:5000';
  const wsUrl = (process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL || '').trim() || 'http://localhost:5000';

  const transformToAuctionState = (data: any | null): AuctionState | null => {
    if (!data) return null;

    const parseHumanNumber = (val: unknown): number => {
      if (typeof val === 'number' && isFinite(val)) return val;
      if (typeof val !== 'string') return 0;
      const s = val.trim().replace(/,/g, '').toUpperCase();
      const m = s.match(/^([0-9]*\.?[0-9]+)\s*([KMB])?$/);
      if (!m) return Number(s) || 0;
      const n = parseFloat(m[1]);
      const suf = m[2];
      const mult = suf === 'B' ? 1e9 : suf === 'M' ? 1e6 : suf === 'K' ? 1e3 : 1;
      return n * mult;
    };

    const totalTokensNum: number = parseHumanNumber(data.totalTokens ?? 0);
    const tokensOnSaleNum: number = parseHumanNumber(data.tokensOnSale ?? data.totalTokens ?? 0);
    const ceilingMarketCapNum: number = typeof data.ceilingMarketCap === 'number' ? data.ceilingMarketCap : parseFloat(String(data.ceilingMarketCap ?? 0)) || 0;
    const currentMarketCapNum: number = typeof data.currentMarketCap === 'number' ? data.currentMarketCap : 0;
    const refundedBTCNum: number = typeof data.refundedBTC === 'number' ? data.refundedBTC : 0;
    const totalProcessedBTC: number = typeof data.totalBTCPledged === 'number' ? data.totalBTCPledged : 0;
    const pendingBTC: number = typeof data.pendingBTCPledged === 'number' ? data.pendingBTCPledged : 0;
    // Use processed + pending to align with how market cap is computed
    const totalRaisedBTC: number = totalProcessedBTC + pendingBTC;
    const currentPrice: number = typeof data.currentPrice === 'number' ? data.currentPrice : 0;
    const priceError: boolean = Boolean(data.priceError ?? false);
    const isActive: boolean | undefined = typeof data.isActive === 'boolean' ? data.isActive : undefined;
    const isCompleted: boolean | undefined = typeof data.isCompleted === 'boolean' ? data.isCompleted : undefined;
    const minPledgeNum: number | undefined = typeof data.minPledge === 'number' ? data.minPledge : undefined;
    const maxPledgeNum: number | undefined = typeof data.maxPledge === 'number' ? data.maxPledge : undefined;

    // Prefer precise timing via start/end - serverTime for consistency across clients
    const startTimeMs: number | null = data.startTime ? new Date(data.startTime).getTime() : null;
    const endTimeMs: number | null = data.endTime ? new Date(data.endTime).getTime() : null;
    const serverTimeMs: number | null = typeof data.serverTime === 'number' ? data.serverTime : null;
    let remainingMs = 0;
    if (endTimeMs && serverTimeMs) {
      remainingMs = Math.max(0, endTimeMs - serverTimeMs);
    } else if (typeof data.remainingTime === 'number') {
      const isLikelyMs = data.remainingTime > 24 * 60 * 60; // if > 1 day assume ms
      remainingMs = isLikelyMs ? data.remainingTime : data.remainingTime * 1000;
    } else {
      remainingMs = 0;
    }
    const hours = Math.max(0, Math.floor(remainingMs / (1000 * 60 * 60)));
    const minutes = Math.max(0, Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60)));
    const seconds = Math.max(0, Math.floor((remainingMs % (1000 * 60)) / 1000));

    const progress = ceilingMarketCapNum > 0 && currentMarketCapNum >= 0
      ? Math.min(100, Math.max(0, (currentMarketCapNum / ceilingMarketCapNum) * 100))
      : 0;

    let recentActivity: AuctionActivity[] = [];
    if (Array.isArray(data.pledges)) {
      recentActivity = data.pledges.slice(-10).map((p: any) => ({
        id: String(p.id ?? `${Math.random()}`),
        walletAddress: String(p.cardinal_address ?? p.user?.cardinal_address ?? p.walletAddress ?? p.userId ?? 'unknown'),
        cardinal_address: p.cardinal_address ?? p.user?.cardinal_address ?? null,
        ordinal_address: p.ordinal_address ?? p.user?.ordinal_address ?? null,
        btcAmount: String(p.btcAmount ?? p.amount ?? '0'),
        estimatedTokens: String(p.estimatedTokens ?? '0'),
        timestamp: String(p.timestamp ?? new Date().toISOString()),
        refundedAmount: p.refundedAmount != null ? String(p.refundedAmount) : undefined,
        isRefunded: Boolean(p.isRefunded ?? false),
      }));
    }

    const state: AuctionState = {
      id: typeof data.id === 'string' ? data.id : undefined,
      config: {
        totalTokens: String(totalTokensNum),
        tokensOnSale: String(tokensOnSaleNum),
        ceilingMarketCapUSD: String(ceilingMarketCapNum),
        minPledgeBTC: String(data.minPledge ?? '0.001'),
        maxPledgeBTC: String(data.maxPledge ?? '0.5'),
      },
      totalRaised: totalRaisedBTC,
      refundedBTC: refundedBTCNum,
      currentMarketCap: currentMarketCapNum,
      ceilingMarketCap: ceilingMarketCapNum,
      ceilingReached: Boolean(data.ceilingReached ?? false),
      progressPercentage: progress,
      currentPrice,
      priceError,
      isActive,
      isCompleted,
      minPledge: minPledgeNum,
      maxPledge: maxPledgeNum,
      timeRemaining: { hours, minutes, seconds },
      startTimeMs: startTimeMs ?? undefined,
      endTimeMs: endTimeMs ?? undefined,
      serverTimeMs: serverTimeMs ?? undefined,
      recentActivity,
    };

    return state;
  };

  // Connect to WebSocket
  const connect = async () => {
    if (socket) {
      socket.close();
    }

    try {
      // Get or create a guest ID
      let guestId = localStorage.getItem('guestId');
      if (!guestId) {
        try {
          // Try to get a guest ID from the server
          const response = await fetch(`${apiUrl}/api/auth/guest-id`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const data = await response.json();
            guestId = data.guestId;
            if (guestId) {
              localStorage.setItem('guestId', guestId);
            }
          }
        } catch (error) {
          console.error('Failed to get guest ID from server:', error);
        }

        // If we still don't have a guestId, generate one locally
        if (!guestId) {
          guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
          localStorage.setItem('guestId', guestId);
        }
      }

      // Connect to Socket.IO with auth in the query params
      const newSocket = io(wsUrl, {
        query: { guestId },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });


      newSocket.on('connect', () => {
        setIsConnected(true);
        console.log('Socket.IO connected');
        debug?.addEntry('sys', 'connect');
      });

      newSocket.on('auth', (data) => {
        if (data.success) {
          setIsAuthenticated(true);
          console.log('Socket.IO authenticated');
          debug?.addEntry('in', 'auth', data);
        }
      });

      newSocket.on('auction_status', (data) => {
        debug?.addEntry('in', 'auction_status', data);
        const next = transformToAuctionState(data);
        setAuctionState((prev) => {
          if (!next) return next;
          if (!prev) return next;
          const shouldKeepPrev = Boolean(next.priceError || (Number(next.currentMarketCap || 0) === 0));
          if (shouldKeepPrev) {
            const merged = { ...next } as AuctionState;
            if (prev.currentMarketCap && prev.currentMarketCap > 0) merged.currentMarketCap = prev.currentMarketCap;
            if (prev.currentPrice && prev.currentPrice > 0) merged.currentPrice = prev.currentPrice;
            if (prev.progressPercentage && prev.progressPercentage > 0) merged.progressPercentage = prev.progressPercentage;
            // keep ceilingReached consistent with preserved cap
            if (typeof merged.ceilingMarketCap === 'number' && merged.ceilingMarketCap > 0) {
              const p = Math.min(100, Math.max(0, (merged.currentMarketCap / merged.ceilingMarketCap) * 100));
              if (p > merged.progressPercentage) merged.progressPercentage = p;
              merged.ceilingReached = p >= 100 || merged.ceilingReached;
            }
            return merged;
          }
          return next;
        });
      });

      // Debounced requester to avoid flooding server on rapid events
      let lastStatusReq = 0;
      const requestStatus = () => {
        const now = Date.now();
        if (now - lastStatusReq < 750) return;
        lastStatusReq = now;
        try { sendMessage('get_auction_status', {}); } catch {}
      };

      // When pledge-related events arrive, refresh auction status so UI totals update immediately
      newSocket.on('pledge_created', (data) => {
        debug?.addEntry('in', 'pledge_created', data);
        requestStatus();
      });
      // Support colon-style variant emitted elsewhere
      newSocket.on('pledge:created', (data) => {
        debug?.addEntry('in', 'pledge:created', data);
        requestStatus();
      });
      newSocket.on('pledge:queue:update', (data) => {
        debug?.addEntry('in', 'pledge:queue:update', data);
        requestStatus();
      });
      newSocket.on('pledge:queue:position', (data) => {
        debug?.addEntry('in', 'pledge:queue:position', data);
        // position alone may not change totals, but keep UI in sync
        requestStatus();
      });
      newSocket.on('pledge_verified', (data) => {
        debug?.addEntry('in', 'pledge_verified', data);
        requestStatus();
      });
      // Also handle processed alias
      newSocket.on('pledge:processed', (data) => {
        debug?.addEntry('in', 'pledge:processed', data);
        requestStatus();
      });

      newSocket.on('error', (data) => {
        console.error('Socket.IO error:', data.message);
        setError(data.message);
        debug?.addEntry('err', 'error', data);
      });

      newSocket.on('disconnect', () => {
        setIsConnected(false);
        setIsAuthenticated(false);
        console.log('Socket.IO disconnected');
        debug?.addEntry('sys', 'disconnect');
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket.IO connection error:', error);
        setIsConnected(false);
        setIsAuthenticated(false);
        setError('Failed to connect to auction server');
        debug?.addEntry('err', 'connect_error', { message: String(error?.message ?? 'unknown'), stack: String((error as any)?.stack ?? '') });
      });

      setSocket(newSocket);
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      debug?.addEntry('err', 'connect_throw', { message: String((error as any)?.message ?? 'unknown') });
    }
  };

  const disconnect = () => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      setIsConnected(false);
      setIsAuthenticated(false);
    }
  };

  const sendMessage = (type: string, data: any) => {
    if (socket && isConnected) {
      try {
        socket.emit(type, data);
        debug?.addEntry('out', type ?? 'emit', data);
      } catch (e) {
        debug?.addEntry('err', 'emit_error', { type, message: String((e as any)?.message ?? 'unknown') });
      }
    } else {
      console.error('Cannot send message: Socket.IO not connected');
      debug?.addEntry('err', 'emit_blocked', { type, reason: 'not_connected' });
    }
  };

  // Auto-connect on component mount
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, []);

  // Reconnect if connection is lost
  useEffect(() => {
    if (!isConnected) {
      const reconnectTimer = setTimeout(() => {
        console.log('Attempting to reconnect...');
        debug?.addEntry('sys', 'reconnect_attempt');
        connect();
      }, 5000);

      return () => clearTimeout(reconnectTimer);
    }
  }, [isConnected]);

  // Request auction status update when authenticated
  useEffect(() => {
    if (isConnected && isAuthenticated) {
      // Set up interval to refresh auction status (server already emits once on connect)
      const statusInterval = setInterval(() => {
        if (isConnected && isAuthenticated) {
          sendMessage('get_auction_status', {});
        }
      }, 30000); // Update every 30 seconds

      return () => clearInterval(statusInterval);
    }
  }, [isConnected, isAuthenticated]);

  const value = {
    isConnected,
    isAuthenticated,
    sendMessage,
    auctionState,
    connect,
    disconnect,
    error,
    socket,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};
