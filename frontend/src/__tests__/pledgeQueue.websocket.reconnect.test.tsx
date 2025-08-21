// File: pledgeQueue.websocket.reconnect.test.tsx - Tests PledgeQueue refetches on WS queue updates (reconnect-like)
import React from 'react';
import { render, waitFor } from '@testing-library/react';

// Capture socket handlers so we can simulate events
const handlers: Record<string, Function[]> = {};
const mockSocket = {
  on: (event: string, cb: Function) => {
    handlers[event] = handlers[event] || [];
    handlers[event].push(cb);
  },
  off: (event: string, cb: Function) => {
    handlers[event] = (handlers[event] || []).filter((h) => h !== cb);
  },
};

jest.mock('../contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    socket: mockSocket, // stable reference across renders
    isAuthenticated: true,
    auctionState: { id: 'a1', ceilingReached: false, totalRaised: 0, config: { totalTokens: '100000000' } },
  }),
}));

import PledgeQueue from '@/components/PledgeQueue';

describe('PledgeQueue - websocket reconnect/updates', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
    for (const k of Object.keys(handlers)) delete handlers[k];
  });
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('refetches when receiving queue update events (simulating reconnect/change)', async () => {
    render(<PledgeQueue auctionId="a1" />);

    // Wait until at least one fetch happened, then record baseline
    await waitFor(() => {
      expect((fetch as jest.Mock)).toHaveBeenCalled();
    });
    const baseline = (fetch as jest.Mock).mock.calls.length;

    // Emit queue update events used by the component, including auctionId payload
    const emit = (event: string, payload?: any) => (handlers[event] || []).forEach((cb) => cb(payload));
    emit('pledge:queue:update', { auctionId: 'a1' });

    await waitFor(() => {
      expect((fetch as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(baseline + 1);
    }, { timeout: 1500 });

    // Also try a processed event to be safe
    emit('pledge:processed', { auctionId: 'a1' });
    await waitFor(() => {
      expect((fetch as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(baseline + 2);
    }, { timeout: 1500 });
  });
});
