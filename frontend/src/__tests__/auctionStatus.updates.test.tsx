// File: auctionStatus.updates.test.tsx - Tests AuctionStatus renders updates, loading, and null-safe states
import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('../hooks/use-websocket', () => ({
  useWebSocket: jest.fn(),
}));

import AuctionStatus from '@/components/AuctionStatus';
import { useWebSocket } from '@/hooks/use-websocket';

const mockUseWs = useWebSocket as jest.Mock;

describe('AuctionStatus - updates and null safety', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('shows connecting spinner when socket not connected', () => {
    mockUseWs.mockReturnValue({ isConnected: false, auctionState: null });
    render(<AuctionStatus />);
    expect(screen.getByText(/Connecting to auction/i)).toBeInTheDocument();
  });

  it('shows loading message when connected but no auctionState yet', () => {
    mockUseWs.mockReturnValue({ isConnected: true, auctionState: null });
    render(<AuctionStatus />);
    expect(screen.getByText(/Loading auction data/i)).toBeInTheDocument();
  });

  it('renders active banner, progress, and totals when state provided', () => {
    mockUseWs.mockReturnValue({
      isConnected: true,
      auctionState: {
        isActive: true,
        timeRemaining: { hours: 1, minutes: 2, seconds: 3 },
        currentPrice: 0.12345678,
        currentMarketCap: 500000,
        ceilingMarketCap: 2000000,
        progressPercentage: undefined,
        totalRaised: 1.23456789,
        refundedBTC: 0,
        minPledge: 0.001,
        maxPledge: 1,
        config: { totalTokens: '100000000', minPledgeBTC: '0.001', maxPledgeBTC: '1' },
        ceilingReached: false,
      },
    });

    render(<AuctionStatus />);

    expect(screen.getByText(/Auction is Active/i)).toBeInTheDocument();
    // Progress percent derived: 500k / 2M = 25%
    expect(screen.getByText(/25.00%/)).toBeInTheDocument();

    // Totals and BTC formatting
    expect(screen.getByText(/Total BTC Pledged/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.23456789 BTC/)).toBeInTheDocument();

    // Time remaining formatted via separate blocks
    expect(screen.getByTestId('countdown-hours')).toHaveTextContent('01');
    expect(screen.getByTestId('countdown-minutes')).toHaveTextContent('02');
    expect(screen.getByTestId('countdown-seconds')).toHaveTextContent('03');

    // Current token price
    expect(screen.getByText(/\$0\.12345678/)).toBeInTheDocument();
  });

  it('renders ended banner when isActive is false', () => {
    mockUseWs.mockReturnValue({
      isConnected: true,
      auctionState: {
        isActive: false,
        timeRemaining: null,
        currentPrice: 0,
        currentMarketCap: 0,
        ceilingMarketCap: 100,
        totalRaised: 0,
        refundedBTC: 0,
        config: {},
      },
    });

    render(<AuctionStatus />);
    expect(screen.getByText(/Auction has Ended/i)).toBeInTheDocument();
  });
});
