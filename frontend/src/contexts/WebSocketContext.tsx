// File: WebSocketContext.tsx - Provides Socket.IO connection and unified AuctionState to the app
"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import io, { Socket } from 'socket.io-client';
import { AuctionActivity, AuctionState } from '@/types/auction';
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

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  const transformToAuctionState = (data: any | null): AuctionState | null => {
    if (!data) return null;

    const totalTokensNum: number = typeof data.totalTokens === 'number' ? data.totalTokens : parseInt(String(data.totalTokens || 0), 10) || 0;
    const ceilingMarketCapNum: number = typeof data.ceilingMarketCap === 'number' ? data.ceilingMarketCap : parseFloat(String(data.ceilingMarketCap || 0)) || 0;
    const currentMarketCapNum: number = typeof data.currentMarketCap === 'number' ? data.currentMarketCap : 0;
    const refundedBTCNum: number = typeof data.refundedBTC === 'number' ? data.refundedBTC : 0;
    const totalRaisedBTC: number = typeof data.totalBTCPledged === 'number' ? data.totalBTCPledged : 0;
    const currentPrice: number = typeof data.currentPrice === 'number' ? data.currentPrice : 0;
    const remainingTimeRaw: number = typeof data.remainingTime === 'number' ? data.remainingTime : 0;

    const isLikelyMs = remainingTimeRaw > 24 * 60 * 60;
    const remainingMs = isLikelyMs ? remainingTimeRaw : remainingTimeRaw * 1000;
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
        walletAddress: String(p.walletAddress ?? p.userId ?? 'unknown'),
        btcAmount: String(p.btcAmount ?? p.amount ?? '0'),
        estimatedTokens: String(p.estimatedTokens ?? '0'),
        timestamp: String(p.timestamp ?? new Date().toISOString()),
        refundedAmount: p.refundedAmount != null ? String(p.refundedAmount) : undefined,
        isRefunded: Boolean(p.isRefunded ?? false),
      }));
    }

    const state: AuctionState = {
      config: {
        totalTokens: String(totalTokensNum),
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
      timeRemaining: { hours, minutes, seconds },
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
        setAuctionState(transformToAuctionState(data));
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
      // Request initial auction status
      sendMessage('get_auction_status', {});

      // Set up interval to refresh auction status
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
