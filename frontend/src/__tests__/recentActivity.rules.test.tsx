// File: recentActivity.rules.test.tsx - Tests RecentActivity list size, sort, badges, and null-safe rendering
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { RecentActivity } from '@/components/recent-activity';

jest.mock('../contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    auctionState: { totalRaised: 1, config: { totalTokens: '1000' } },
  }),
}));

describe('RecentActivity - rules', () => {
  const mk = (id: number, minsAgo: number, overrides: Partial<any> = {}) => ({
    id: String(id),
    btcAmount: '0.001',
    estimatedTokens: '1',
    walletAddress: `bc1q${id}xxx${id}zz`,
    timestamp: new Date(Date.now() - minsAgo * 60_000).toISOString(),
    isRefunded: false,
    ...overrides,
  });

  it('limits to 10 newest items sorted by time desc and shows badges', () => {
    const items = Array.from({ length: 15 }).map((_, i) => mk(i + 1, i));
    const { rerender } = render(<RecentActivity activities={items} isConnected={true} />);

    const list = screen.getByTestId('activity-list');
    const rows = within(list).getAllByTestId(/^activity-\d+$/);
    expect(rows.length).toBe(10);

    // First row should be the most recent (minsAgo = 0 => id 1)
    expect(rows[0]).toHaveAttribute('data-testid', 'activity-1');

    // Badge text (default confirmed)
    expect(within(rows[0]).getByText(/Confirmed/i)).toBeInTheDocument();

    // Refunded badge when isRefunded (rerender with a single refunded item)
    rerender(<RecentActivity activities={[mk(100, 0, { isRefunded: true })]} isConnected={true} />);
    const row = screen.getByTestId('activity-100');
    expect(within(row).getByText((text) => text === 'Refunded')).toBeInTheDocument();
  });

  it('shows empty state when no activities', () => {
    render(<RecentActivity activities={[]} isConnected={false} />);
    expect(screen.getByText(/No recent activity/i)).toBeInTheDocument();
    expect(screen.getByTestId('text-connection-status').textContent).toMatch(/Disconnected/i);
  });
});
