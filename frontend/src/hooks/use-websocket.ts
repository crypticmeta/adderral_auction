// File: use-websocket.ts - Thin wrapper around WebSocketContext exposing AuctionState for UI
// Hook for WebSocket using the WebSocketContext
import { useWebSocket as useSocketIOWebSocket } from '@/contexts/WebSocketContext';
import { AuctionState } from '@/types/auction';

/**
 * This hook is a wrapper around the WebSocketContext
 * It's kept for backward compatibility with components using this hook
 */
export const useWebSocket = (_walletAddress?: string) => {
  // Use the existing Socket.IO implementation
  const wsContext = useSocketIOWebSocket();

  // No transformation here; WebSocketContext already exposes unified AuctionState

  return {
    auctionState: wsContext.auctionState as AuctionState | null,
    isConnected: wsContext.isConnected,
    error: wsContext.error,
  };
};
