// File: recentActivity.transitions.test.tsx - Tests mixed refunded/confirmed items and transition updates
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { RecentActivity } from '@/components/recent-activity';

// Provide minimal auction state via context mock
jest.mock('../contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ auctionState: { totalRaised: 1, config: { totalTokens: '1000' } } }),
}));

describe('RecentActivity - mixed states and transitions', () => {
  const mk = (id: number, minsAgo: number, overrides: Partial<any> = {}) => ({
    id: String(id),
    btcAmount: '0.001',
    estimatedTokens: '1',
    walletAddress: `bc1q${id}xxx${id}zz`,
    timestamp: new Date(Date.now() - minsAgo * 60_000).toISOString(),
    isRefunded: false,
    ...overrides,
  });

  it('renders confirmed and refunded badges correctly in a mixed list', () => {
    const items = [
      mk(1, 0, { isRefunded: false }),
      mk(2, 1, { isRefunded: true }),
      mk(3, 2, { isRefunded: false }),
    ];

    render(<RecentActivity activities={items} isConnected={true} />);

    const row2 = screen.getByTestId('activity-2');
    expect(within(row2).getByText((t) => t === 'Refunded')).toBeInTheDocument();

    const row1 = screen.getByTestId('activity-1');
    expect(within(row1).getByText(/Confirmed/i)).toBeInTheDocument();
  });

  it('updates a row badge when an item switches from confirmed to refunded', () => {
    const base = mk(10, 0, { isRefunded: false });
    const { rerender } = render(<RecentActivity activities={[base]} isConnected={true} />);
    const row = screen.getByTestId('activity-10');
    expect(within(row).getByText(/Confirmed/i)).toBeInTheDocument();

    // Switch state to refunded and assert DOM updates
    rerender(<RecentActivity activities={[{ ...base, isRefunded: true }]} isConnected={true} />);
    expect(within(row).getByText((t) => t === 'Refunded')).toBeInTheDocument();
  });
});
