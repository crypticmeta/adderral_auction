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

  it('uses stable avatar seed and truncates BTC addresses only', () => {
    const btcAddr = 'bc1q12345abcdefghijklmno999999999';
    const nonBtc = 'user-1';
    const cardinal = 'bc1paaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; // BTC-like → will be truncated and used as display

    const items = [
      mk(1, 0, { walletAddress: btcAddr }),
      mk(2, 1, { walletAddress: nonBtc }),
      mk(3, 2, { walletAddress: 'ignored-if-cardinal', cardinal_address: cardinal }),
    ];

    render(<RecentActivity activities={items} isConnected={true} />);

    // BTC-like: truncated
    const row1 = screen.getByTestId('activity-1');
    const addr1 = screen.getByTestId('activity-address-1');
    expect(addr1.textContent).toBe(`${btcAddr.slice(0, 6)}...${btcAddr.slice(-4)}`);
    const img1 = row1.querySelector('img[alt="avatar"]') as HTMLImageElement;
    expect(img1).toBeTruthy();
    const seed1 = new URL(String(img1.src)).searchParams.get('seed');
    expect(seed1 && decodeURIComponent(seed1)).toBe(btcAddr);

    // Non-BTC: not truncated, avatar seed equals address
    const row2 = screen.getByTestId('activity-2');
    const addr2 = screen.getByTestId('activity-address-2');
    expect(addr2.textContent).toBe(nonBtc);
    const img2 = row2.querySelector('img[alt="avatar"]') as HTMLImageElement;
    const seed2 = new URL(String(img2.src)).searchParams.get('seed');
    expect(seed2 && decodeURIComponent(seed2)).toBe(nonBtc);

    // Cardinal present: display prefers cardinal; BTC-like so truncated and used as seed
    const row3 = screen.getByTestId('activity-3');
    const addr3 = screen.getByTestId('activity-address-3');
    expect(addr3.textContent).toBe(`${cardinal.slice(0, 6)}...${cardinal.slice(-4)}`);
    const img3 = row3.querySelector('img[alt="avatar"]') as HTMLImageElement;
    const seed3 = new URL(String(img3.src)).searchParams.get('seed');
    expect(seed3 && decodeURIComponent(seed3)).toBe(cardinal);
  });
});
