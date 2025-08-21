// File: pledgeInterface.validation.test.tsx - Tests validation, disabled states, and balance gating in PledgeInterface
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('../hooks/use-websocket', () => ({
  useWebSocket: () => ({ auctionState: { id: 'auc-1' } }),
}));

jest.mock('bitcoin-wallet-adapter', () => ({
  useWalletBalance: () => ({
    balance: { confirmed: 0.5, usd: 20000 },
    btcPrice: 40000,
    isLoading: false,
    fetchBalance: jest.fn(),
    refreshPrice: jest.fn(),
    formatBalance: (v: number) => `${v.toFixed(6)} BTC`,
    convertToUSD: (v: number) => v * 40000,
  }),
}));

import PledgeInterface from '@/components/PledgeInterface';

describe('PledgeInterface - validation and gating', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
    // guest-id endpoint
    (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ guestId: 'guest-1', currentBTCPrice: 40000 }) });
  });
  afterEach(() => {
    jest.resetAllMocks();
  });

  const baseProps = {
    minPledge: 0.001,
    maxPledge: 1,
    currentPrice: 1, // value not used for est tokens right now
    isWalletConnected: false,
    walletAddress: 'bc1qwxyz',
  };

  it('disables pledge button when wallet not connected or amount empty', () => {
    const { rerender } = render(<PledgeInterface {...baseProps} />);
    expect(screen.getByTestId('button-pledge')).toBeDisabled();

    // Connect wallet but keep amount empty
    rerender(<PledgeInterface {...baseProps} isWalletConnected={true} />);
    expect(screen.getByTestId('button-pledge')).toBeDisabled();
  });

  it('shows error when amount below min or above max', async () => {
    render(<PledgeInterface {...baseProps} isWalletConnected={true} />);
    const input = screen.getByTestId('input-pledge-amount');
    const btn = screen.getByTestId('button-pledge');

    // Below min
    fireEvent.change(input, { target: { value: '0.0005' } });
    await act(async () => { fireEvent.click(btn); });
    expect(await screen.findByText(/Invalid amount/i)).toBeInTheDocument();

    // Above max
    fireEvent.change(input, { target: { value: '5' } });
    await act(async () => { fireEvent.click(btn); });
    expect(await screen.findByText(/Invalid amount/i)).toBeInTheDocument();
  });

  it('gates by balance: warns when amount exceeds confirmed balance', () => {
    render(<PledgeInterface {...baseProps} isWalletConnected={true} />);
    const input = screen.getByTestId('input-pledge-amount');

    // Confirmed balance from mock = 0.5 BTC
    fireEvent.change(input, { target: { value: '0.6' } });
    expect(screen.getByText(/exceeds your confirmed wallet balance/i)).toBeInTheDocument();
    expect(screen.getByTestId('button-pledge')).toBeDisabled();
  });

  it('does not show estimated tokens block when calculation is zero', () => {
    // Override currentPrice so that estimated tokens floor to 0 for the given input.
    // With btcPrice=40000 and amount=0.1 BTC, pledge USD ~ $4,000; using currentPrice > $4000/token ensures 0 tokens.
    render(<PledgeInterface {...baseProps} isWalletConnected={true} currentPrice={10000} />);
    const input = screen.getByTestId('input-pledge-amount');
    fireEvent.change(input, { target: { value: '0.1' } });
    // current implementation yields 0 estimated tokens -> block hidden
    expect(screen.queryByTestId('text-estimated-tokens')).toBeNull();
  });
});
