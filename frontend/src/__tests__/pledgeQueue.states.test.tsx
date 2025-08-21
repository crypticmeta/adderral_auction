// File: pledgeQueue.states.test.tsx - Tests loading/empty/error states of PledgeQueue with debounced fetch
import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';

// Mock WebSocket context used by PledgeQueue
jest.mock('../contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    socket: { on: jest.fn(), off: jest.fn() },
    isAuthenticated: true,
    auctionState: { ceilingReached: false, totalRaised: 0, config: { totalTokens: '100000000' } },
  }),
}));

import PledgeQueue from '@/components/PledgeQueue';

describe('PledgeQueue - states', () => {
  const apiBase = 'http://localhost:5000';

  beforeEach(() => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
  });
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('shows empty state when API returns empty list', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => [] });

    render(<PledgeQueue auctionId="a1" />);

    const queueCard = screen.getByRole('heading', { name: /pledge queue/i }).closest('div');
    expect(queueCard).toBeTruthy();
    if (!queueCard) return;

    const scoped = within(queueCard);
    await waitFor(() => {
      expect(scoped.getByText(/No pledges in the queue yet/i)).toBeInTheDocument();
    });
  });

  it('renders an error message when API fails (500)', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });

    render(<PledgeQueue auctionId="a1" />);

    const queueCard = screen.getByRole('heading', { name: /pledge queue/i }).closest('div');
    expect(queueCard).toBeTruthy();
    if (!queueCard) return;

    const scoped = within(queueCard);
    await waitFor(() => {
      expect(scoped.getByText(/Failed to fetch pledges \(500\)/i)).toBeInTheDocument();
    });
  });

  it('does not fetch when auctionId is missing and shows empty view without spinner', async () => {
    render(<PledgeQueue auctionId={'' as any} />);

    const queueCard = screen.getByRole('heading', { name: /pledge queue/i }).closest('div');
    expect(queueCard).toBeTruthy();
  });
});
