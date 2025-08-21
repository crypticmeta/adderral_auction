// File: websocketContext.reconnect.test.tsx - Tests WebSocketContext reconnect and auth flow
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { WebSocketProvider, useWebSocket } from '@/contexts/WebSocketContext';

jest.useFakeTimers();

// Capture socket handlers
const handlers: Record<string, Function[]> = {};
const mockSocket = {
  on: (event: string, cb: Function) => {
    handlers[event] = handlers[event] || [];
    handlers[event].push(cb);
  },
  off: (event: string, cb?: Function) => {
    if (!cb) { handlers[event] = []; return; }
    handlers[event] = (handlers[event] || []).filter((h) => h !== cb);
  },
  emit: jest.fn(),
  close: jest.fn(),
  disconnect: jest.fn(),
};

// Mock socket.io-client to return our stable socket
jest.mock('socket.io-client', () => ({
  __esModule: true,
  default: jest.fn(() => mockSocket),
}));

// Helper component to expose context values for assertions
const Probe: React.FC = () => {
  const { isConnected, isAuthenticated } = useWebSocket();
  return (
    <div>
      <span data-testid="connected">{String(isConnected)}</span>
      <span data-testid="authed">{String(isAuthenticated)}</span>
    </div>
  );
};

describe('WebSocketContext - reconnect flow', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ guestId: 'g1' }) });
    for (const k of Object.keys(handlers)) delete handlers[k];
    (mockSocket.emit as jest.Mock).mockClear();
  });

  it('connects, authenticates, handles disconnect, and reconnects after backoff', async () => {
    render(
      <WebSocketProvider>
        <Probe />
      </WebSocketProvider>
    );

    // Wait until guest id is fetched and socket listeners likely registered
    await waitFor(() => {
      expect((global as any).fetch).toHaveBeenCalled();
    });

    // Simulate socket connect
    handlers['connect']?.forEach((cb) => cb());
    await waitFor(() => {
      expect(screen.getByTestId('connected').textContent).toBe('true');
    });

    // Simulate auth success
    handlers['auth']?.forEach((cb) => cb({ success: true }));
    await waitFor(() => {
      expect(screen.getByTestId('authed').textContent).toBe('true');
    });

    // Simulate disconnect
    handlers['disconnect']?.forEach((cb) => cb());
    await waitFor(() => {
      expect(screen.getByTestId('connected').textContent).toBe('false');
      expect(screen.getByTestId('authed').textContent).toBe('false');
    });

    // Advance timers to trigger reconnect (5s backoff)
    jest.advanceTimersByTime(5000);

    // After reconnect attempt, simulate connect and auth again
    handlers['connect']?.forEach((cb) => cb());
    await waitFor(() => {
      expect(screen.getByTestId('connected').textContent).toBe('true');
    });
    handlers['auth']?.forEach((cb) => cb({ success: true }));
    await waitFor(() => {
      expect(screen.getByTestId('authed').textContent).toBe('true');
    });
  });
});
